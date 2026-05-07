/**
 * distribution.ts — R-weighted SOL transfer engine, chunked across multiple txs.
 *
 * Solana's tx size cap is 1232 bytes. A single tx with many SystemProgram
 * transfers exceeds this, so we batch into chunks of TRANSFERS_PER_TX and
 * send one tx per chunk.
 *
 * Per-chunk idempotency:
 *   - distributions table has UNIQUE(trade_signature, recipient_wallet)
 *   - On retry, we only re-process rows still in status != 'confirmed'
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { connection, requireWallet, solToLamports } from './solana.js';
import { logger } from './logger.js';
import { db } from './db.js';
import type { ParsedSwap } from './pump.js';
import {
  getDistributionEligible,
  recordDistributions,
  markTradeDistributed,
} from './state.js';

const TRANSFERS_PER_TX = 10;

interface PendingRow {
  recipient_wallet: string;
  status: string;
}

export async function distributeFee(swap: ParsedSwap): Promise<void> {
  const log = logger.child({ sig: swap.signature });

  const carriers = await getDistributionEligible();
  if (carriers.length === 0) {
    log.debug('no eligible carriers — fee pools in wallet until first spread');
    await markTradeDistributed(swap.signature);
    return;
  }

  const feeLamports = solToLamports(swap.feeAmountSol);
  if (feeLamports < 1) {
    log.debug({ feeSol: swap.feeAmountSol }, 'fee too small — skip');
    await markTradeDistributed(swap.signature);
    return;
  }

  const totalR = carriers.reduce((sum, c) => sum + c.rScore, 0);
  if (totalR === 0) {
    await markTradeDistributed(swap.signature);
    return;
  }

  // Compute per-recipient lamports
  const allocations = carriers
    .map((c) => ({
      recipient: c.wallet,
      rShare: c.rScore,
      totalR,
      lamports: Math.floor((feeLamports * c.rScore) / totalR),
    }))
    .filter((a) => a.lamports > 0);

  if (allocations.length === 0) {
    log.debug({ feeLamports, totalR }, 'all allocations rounded to zero — skip');
    await markTradeDistributed(swap.signature);
    return;
  }

  // Persist intent (idempotent)
  await recordDistributions(
    allocations.map((a) => ({
      tradeSignature: swap.signature,
      recipientWallet: a.recipient,
      rShare: a.rShare,
      totalR: a.totalR,
      amountSol: a.lamports / 1_000_000_000,
    })),
  );

  // Pull pending rows (everything not 'confirmed') with their per-row lamport amount
  const { data: pending, error: pendingErr } = await db
    .from('distributions')
    .select('recipient_wallet, amount_sol, status')
    .eq('trade_signature', swap.signature)
    .neq('status', 'confirmed');
  if (pendingErr) throw pendingErr;

  const pendingRows = (pending ?? []) as Array<{
    recipient_wallet: string;
    amount_sol: number | string;
    status: string;
  }>;
  if (pendingRows.length === 0) {
    log.debug('all chunks already confirmed');
    await markTradeDistributed(swap.signature);
    return;
  }

  // Build (recipient, lamports) pairs
  const transfers = pendingRows.map((r) => ({
    recipient: r.recipient_wallet,
    lamports: solToLamports(Number(r.amount_sol)),
  }));

  const chunks = chunkArray(transfers, TRANSFERS_PER_TX);
  let confirmedChunks = 0;
  let failedChunks = 0;
  const errors: string[] = [];

  for (const chunk of chunks) {
    try {
      const sig = await sendChunk(chunk);
      await markChunkConfirmed(swap.signature, chunk, sig);
      confirmedChunks++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      failedChunks++;
      log.warn(
        { err: msg, chunkSize: chunk.length },
        'distribution chunk failed (will retry via reconciliation)',
      );
      await markChunkFailed(swap.signature, chunk, msg);
    }
  }

  if (failedChunks === 0) {
    await markTradeDistributed(swap.signature);
    log.info(
      {
        chunks: chunks.length,
        carriersPaid: transfers.length,
        totalLamports: transfers.reduce((s, t) => s + t.lamports, 0),
      },
      'distribution fully confirmed',
    );
  } else {
    log.error({ confirmedChunks, failedChunks, errors }, 'distribution partial');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Transfer {
  recipient: string;
  lamports: number;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function sendChunk(chunk: Transfer[]): Promise<string> {
  const wallet = requireWallet();
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  for (const t of chunk) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(t.recipient),
        lamports: t.lamports,
      }),
    );
  }
  const sig = await connection.sendTransaction(tx, [wallet], {
    skipPreflight: false,
    maxRetries: 2,
  });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function markChunkConfirmed(
  tradeSignature: string,
  chunk: Transfer[],
  sig: string,
): Promise<void> {
  const recipients = chunk.map((c) => c.recipient);
  const { error } = await db
    .from('distributions')
    .update({
      status: 'confirmed',
      tx_signature: sig,
      confirmed_at: new Date().toISOString(),
    })
    .eq('trade_signature', tradeSignature)
    .in('recipient_wallet', recipients);
  if (error) throw error;
}

async function markChunkFailed(
  tradeSignature: string,
  chunk: Transfer[],
  errorMsg: string,
): Promise<void> {
  const recipients = chunk.map((c) => c.recipient);
  const { error } = await db
    .from('distributions')
    .update({
      status: 'failed',
      last_error: errorMsg.slice(0, 500),
      attempts: 1,
    })
    .eq('trade_signature', tradeSignature)
    .in('recipient_wallet', recipients);
  if (error) {
    logger.warn({ err: error }, 'mark chunk failed update failed');
  }
}
