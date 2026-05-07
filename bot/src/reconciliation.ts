/**
 * reconciliation.ts — Periodic recovery loops.
 *
 * Two jobs on the same timer:
 *   1. Retry stuck distributions (trades observed > 2min ago, not distributed).
 *   2. Expire wallet quarantines that have passed their 24h cooldown.
 *
 * `distributeFee` is idempotent — re-running for an already-confirmed trade
 * is a safe no-op.
 */

import { db } from './db.js';
import { logger } from './logger.js';
import { distributeFee } from './distribution.js';
import { expireQuarantines } from './state.js';
import type { ParsedSwap, SwapVenue, SwapDirection } from './pump.js';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const STUCK_TRADE_AGE_MS = 2 * 60 * 1000;
const BATCH_SIZE = 20;

export function startReconciliation(): NodeJS.Timer {
  void runOnce();
  return setInterval(runOnce, RECONCILE_INTERVAL_MS);
}

async function runOnce(): Promise<void> {
  try {
    const expired = await expireQuarantines();
    if (expired > 0) logger.info({ count: expired }, 'quarantines expired');
  } catch (err) {
    logger.error({ err }, 'expireQuarantines failed');
  }

  try {
    const cutoff = new Date(Date.now() - STUCK_TRADE_AGE_MS).toISOString();
    const { data, error } = await db
      .from('trades')
      .select('*')
      .eq('distributed', false)
      .lt('observed_at', cutoff)
      .order('observed_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      logger.error({ err: error }, 'reconciliation query failed');
      return;
    }
    if (!data || data.length === 0) return;

    logger.info({ count: data.length }, 'reconciling stuck trades');

    for (const row of data) {
      const swap = rowToSwap(row);
      try {
        await distributeFee(swap);
      } catch (err) {
        logger.warn(
          { err, signature: swap.signature },
          'reconciliation retry failed',
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'reconciliation pass failed');
  }
}

interface TradeRow {
  signature: string;
  slot: number;
  on_chain_at: string | null;
  direction: SwapDirection;
  wallet_address: string;
  sol_amount: number | string;
  token_amount: number | string;
  fee_amount_sol: number | string;
  venue: SwapVenue;
}

function rowToSwap(row: TradeRow): ParsedSwap {
  return {
    kind: 'swap',
    signature: row.signature,
    slot: row.slot,
    onChainAt: row.on_chain_at ? new Date(row.on_chain_at) : new Date(),
    direction: row.direction,
    walletAddress: row.wallet_address,
    solAmount: Number(row.sol_amount),
    tokenAmount: Number(row.token_amount),
    feeAmountSol: Number(row.fee_amount_sol),
    venue: row.venue,
  };
}
