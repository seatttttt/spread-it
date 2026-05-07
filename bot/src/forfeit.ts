/**
 * forfeit.ts — Drain-driven forfeit detection for SWAP sells.
 *
 * Each sell decreases the seller's balance and counts as drain.
 * If post-update drain_pct >= FORFEIT_DRAIN_PCT → R reset + 24h quarantine.
 *
 * Spread-related forfeits live in infection.ts (since the drain decision
 * happens inline with spread classification).
 */

import { logger } from './logger.js';
import { config } from './config.js';
import type { ParsedSwap } from './pump.js';
import { updateBalance, forfeitWallet, getWalletScore } from './state.js';

interface ForfeitResult {
  triggered: boolean;
  drainPct: number;
}

/**
 * Process the balance impact of a SWAP:
 *   buy  → inflow, peak update only
 *   sell → outflow as drain, may trigger forfeit
 */
export async function applySwapBalance(swap: ParsedSwap): Promise<ForfeitResult> {
  if (swap.direction === 'buy') {
    await updateBalance(swap.walletAddress, swap.tokenAmount, null);
    return { triggered: false, drainPct: 0 };
  }

  // sell — outflow as drain
  const peaks = await updateBalance(
    swap.walletAddress,
    -swap.tokenAmount,
    'drain',
  );

  // Patient Zero is immune to forfeit (the SQL fn no-ops on PZ).
  const score = await getWalletScore(swap.walletAddress);
  if (score?.status === 'patient_zero') {
    return { triggered: false, drainPct: peaks.drainPct };
  }

  if (
    peaks.peakBalance > 0 &&
    peaks.drainPct >= config.FORFEIT_DRAIN_PCT
  ) {
    await forfeitWallet(swap.walletAddress, swap.signature);
    logger.info(
      {
        wallet: swap.walletAddress,
        drainPct: peaks.drainPct,
        peak: peaks.peakBalance,
        sig: swap.signature,
      },
      'sell triggered forfeit',
    );
    return { triggered: true, drainPct: peaks.drainPct };
  }

  return { triggered: false, drainPct: peaks.drainPct };
}
