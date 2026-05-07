/**
 * event-processor.ts — Per-event orchestrator.
 *
 * Routes ParsedEvent into the right pipeline:
 *   - SWAP   → applySwapBalance (peak/drain/forfeit) → distributeFee
 *   - SPREAD → processSpread (anti-sybil + R credit + peak update + forfeit)
 *
 * Every step is best-effort with structured logging. A failure in distribute
 * does not roll back peak updates — the trade record stands and reconciliation
 * will retry the distribution.
 */

import { logger } from './logger.js';
import type { ParsedEvent, ParsedSwap, ParsedSpread } from './pump.js';
import { recordTrade } from './state.js';
import { applySwapBalance } from './forfeit.js';
import { processSpread } from './infection.js';
import { distributeFee } from './distribution.js';

export async function processEvent(event: ParsedEvent): Promise<void> {
  if (event.kind === 'swap') return processSwap(event);
  return processSpreadEvent(event);
}

async function processSwap(swap: ParsedSwap): Promise<void> {
  const log = logger.child({ sig: swap.signature, slot: swap.slot });
  log.info(
    {
      kind: 'swap',
      direction: swap.direction,
      wallet: swap.walletAddress,
      sol: swap.solAmount,
      fee: swap.feeAmountSol,
      venue: swap.venue,
    },
    'processing swap',
  );

  // 1. Idempotent insert
  const inserted = await recordTrade(swap);
  if (!inserted) {
    log.debug('duplicate swap — skipping');
    return;
  }

  // 2. Balance + drain + maybe forfeit
  try {
    const result = await applySwapBalance(swap);
    if (result.triggered) {
      log.info({ drainPct: result.drainPct }, 'forfeit on sell');
    }
  } catch (err) {
    log.error({ err }, 'applySwapBalance failed (non-fatal)');
  }

  // 3. R-weighted distribution
  try {
    await distributeFee(swap);
  } catch (err) {
    log.error({ err }, 'distribution failed — reconciliation will retry');
  }
}

async function processSpreadEvent(spread: ParsedSpread): Promise<void> {
  const log = logger.child({ sig: spread.signature });
  log.info(
    {
      kind: 'spread',
      sender: spread.sender,
      recipient: spread.recipient,
      amount: spread.amountTokens,
    },
    'processing spread',
  );
  try {
    await processSpread(spread);
  } catch (err) {
    log.error({ err }, 'processSpread failed');
  }
}
