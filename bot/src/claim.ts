/**
 * claim.ts — Periodic creator-fee claim from pump.fun + PumpSwap vaults.
 *
 * Pump.fun creator fees do NOT auto-stream to the creator wallet. They
 * accumulate in PDA vaults (one per token, per program — bonding curve
 * AND PumpSwap AMM) and require the creator to sign a `collect_coin_creator_fee`
 * instruction to withdraw.
 *
 * This bot job polls the vault balance every CLAIM_INTERVAL_MS. When
 * accumulated fees exceed MIN_CLAIM_LAMPORTS, it builds + signs + sends
 * the collect instruction(s) — bringing SOL into the distribution wallet
 * which then funds the per-trade distributions.
 *
 * Reference: https://github.com/nirholas/pump-fun-sdk/blob/main/docs/fee-sharing.md
 */

import { Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { createRequire } from 'node:module';
import { connection, distributionWallet, lamportsToSol } from './solana.js';
import { logger } from './logger.js';

// The @nirholas/pump-sdk package has a broken ESM exports config in v1.30
// (exports.import points at dist/esm/index.js but the file is index.mjs).
// We load it as CJS via createRequire to bypass the broken exports field.
import type * as PumpSdkTypes from '@nirholas/pump-sdk';
const require = createRequire(import.meta.url);
const pumpSdkLib = require('@nirholas/pump-sdk') as typeof PumpSdkTypes;
const { OnlinePumpSdk } = pumpSdkLib;

type OnlinePumpSdkInstance = InstanceType<typeof OnlinePumpSdk>;

const CLAIM_INTERVAL_MS = 10_000; // every 10s as configured
const MIN_CLAIM_LAMPORTS = 50_000; // 0.00005 SOL. Skip claims smaller than this (gas-wasteful).

let pumpSdk: OnlinePumpSdkInstance | null = null;

function getSdk(): OnlinePumpSdkInstance {
  if (!pumpSdk) {
    pumpSdk = new OnlinePumpSdk(connection);
  }
  return pumpSdk;
}

export interface ClaimResult {
  attempted: boolean;
  claimed: boolean;
  pendingLamports: number;
  txSignature?: string;
  error?: string;
}

/**
 * Single claim attempt. Idempotent — safe to call repeatedly.
 *
 * Flow:
 *   1. Read vault balance for both Pump + PumpSwap programs
 *   2. Skip if balance below MIN_CLAIM_LAMPORTS
 *   3. Build collect instructions (one per program with non-zero balance)
 *   4. Send tx, await confirmation
 */
export async function attemptClaim(): Promise<ClaimResult> {
  const sdk = getSdk();
  const creator = distributionWallet.publicKey;

  let pendingLamports = 0;
  try {
    const balance = await sdk.getCreatorVaultBalanceBothPrograms(creator);
    pendingLamports = Number(balance);
  } catch (err) {
    return {
      attempted: false,
      claimed: false,
      pendingLamports: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (pendingLamports < MIN_CLAIM_LAMPORTS) {
    return { attempted: false, claimed: false, pendingLamports };
  }

  try {
    const instructions = await sdk.collectCoinCreatorFeeInstructions(creator);
    if (instructions.length === 0) {
      return { attempted: true, claimed: false, pendingLamports };
    }

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
    for (const ix of instructions) {
      tx.add(ix);
    }

    const sig = await connection.sendTransaction(tx, [distributionWallet], {
      skipPreflight: false,
      maxRetries: 2,
    });
    await connection.confirmTransaction(sig, 'confirmed');

    logger.info(
      {
        sig,
        pendingLamports,
        sol: lamportsToSol(pendingLamports),
      },
      'creator fees claimed',
    );

    return { attempted: true, claimed: true, pendingLamports, txSignature: sig };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, pendingLamports }, 'claim attempt failed');
    return {
      attempted: true,
      claimed: false,
      pendingLamports,
      error: msg,
    };
  }
}

/**
 * Start the periodic claim loop. Returns a timer handle for shutdown.
 *
 * Uses an in-flight guard so overlapping calls are skipped — important at
 * tight intervals (10s) where a single slow tx could stack up.
 */
export function startClaimLoop(intervalMs: number = CLAIM_INTERVAL_MS): NodeJS.Timer {
  let inFlight = false;

  logger.info({ intervalMs }, 'starting claim loop');

  return setInterval(async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await attemptClaim();
    } catch (err) {
      logger.error({ err }, 'claim loop unhandled error');
    } finally {
      inFlight = false;
    }
  }, intervalMs);
}
