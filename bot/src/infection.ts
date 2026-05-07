/**
 * infection.ts — Spread (TRANSFER) event processor.
 *
 * Decides if a wallet-to-wallet transfer of our token earns the sender +1 R
 * or counts as drain. Updates wallet_peaks accordingly. Triggers forfeit
 * if drain threshold is crossed.
 *
 * Validation pipeline (short-circuits on first failure):
 *   1. amount >= SPREAD_MIN_TOKENS
 *   2. sender holds >= CARRIER_MIN_TOKENS
 *   3. sender status != 'quarantined'
 *   4. sender != patient_zero (PZ ornamental, no R earning)
 *   5. recipient != patient_zero
 *   6. (sender, recipient) pair has not already been credited
 *   7. recipient passes anti-sybil
 *
 * On VALID: record spread, +1 R, peak update with 'spread' kind (excluded from drain).
 * On INVALID: record spread (with reason), peak update with 'drain' kind, check forfeit.
 */

import { logger } from './logger.js';
import { config, CARRIER_MIN_TOKENS, SPREAD_MIN_TOKENS } from './config.js';
import type { ParsedSpread } from './pump.js';
import {
  recordSpread,
  hasValidSpread,
  getWalletPeak,
  getWalletScore,
  creditR,
  updateBalance,
  forfeitWallet,
  type RejectionReason,
} from './state.js';
import { verifyRecipient } from './sybil.js';

interface ProcessResult {
  valid: boolean;
  reason: RejectionReason | null;
  forfeitTriggered: boolean;
}

export async function processSpread(spread: ParsedSpread): Promise<ProcessResult> {
  const log = logger.child({
    sig: spread.signature,
    sender: spread.sender,
    recipient: spread.recipient,
    amount: spread.amountTokens,
  });

  // Idempotency: bail if we've already recorded this exact (signature, log_index).
  const inserted = await recordSpread(spread, false, 'sybil_check_failed');
  if (!inserted) {
    log.debug('duplicate spread — skipping');
    return { valid: false, reason: null, forfeitTriggered: false };
  }
  // We inserted as invalid; we'll update to valid+null reason if it passes.

  const verdict = await classify(spread);

  if (verdict.valid) {
    await markValid(spread);
    await creditR(spread.sender);
    await updateBalance(spread.sender, -spread.amountTokens, 'spread');
    await updateBalance(spread.recipient, spread.amountTokens, null);
    log.info('spread CREDITED (+1 R)');
    return { valid: true, reason: null, forfeitTriggered: false };
  }

  // Invalid spread — outflow counts as drain.
  await markInvalid(spread, verdict.reason);
  const senderPeaks = await updateBalance(
    spread.sender,
    -spread.amountTokens,
    'drain',
  );
  await updateBalance(spread.recipient, spread.amountTokens, null);
  log.info({ reason: verdict.reason }, 'spread REJECTED — drain');

  let forfeitTriggered = false;
  if (
    senderPeaks.peakBalance > 0 &&
    senderPeaks.drainPct >= config.FORFEIT_DRAIN_PCT
  ) {
    await forfeitWallet(spread.sender, spread.signature);
    forfeitTriggered = true;
    log.info(
      { drainPct: senderPeaks.drainPct, peak: senderPeaks.peakBalance },
      'sender quarantined',
    );
  }

  return { valid: false, reason: verdict.reason, forfeitTriggered };
}

interface Verdict {
  valid: boolean;
  reason: RejectionReason | null;
}

async function classify(spread: ParsedSpread): Promise<Verdict> {
  if (spread.amountTokens < SPREAD_MIN_TOKENS) {
    return { valid: false, reason: 'amount_below_min' };
  }

  // Patient Zero filter — neither side may earn via PZ pair.
  const senderScore = await getWalletScore(spread.sender);
  const recipientScore = await getWalletScore(spread.recipient);
  if (senderScore?.status === 'patient_zero') {
    return { valid: false, reason: 'patient_zero_excluded' };
  }
  if (recipientScore?.status === 'patient_zero') {
    return { valid: false, reason: 'patient_zero_excluded' };
  }

  // Sender quarantine check
  if (senderScore?.status === 'quarantined') {
    return { valid: false, reason: 'sender_quarantined' };
  }

  // Sender carrier eligibility
  const senderPeak = await getWalletPeak(spread.sender);
  if (!senderPeak || senderPeak.currentBalance < CARRIER_MIN_TOKENS) {
    return { valid: false, reason: 'sender_below_carrier_min' };
  }

  // Pair already credited
  const alreadyCredited = await hasValidSpread(spread.sender, spread.recipient);
  if (alreadyCredited) {
    return { valid: false, reason: 'pair_already_spread' };
  }

  // Anti-sybil
  const sybil = await verifyRecipient(spread.recipient);
  if (!sybil.passes) {
    return { valid: false, reason: sybil.reason };
  }

  return { valid: true, reason: null };
}

async function markValid(spread: ParsedSpread): Promise<void> {
  // Update the row inserted in processSpread() to valid=true.
  // Done via direct db call to avoid double-insert paths.
  const { db } = await import('./db.js');
  const { error } = await db
    .from('spreads')
    .update({ valid: true, rejection_reason: null })
    .eq('signature', spread.signature)
    .eq('log_index', spread.logIndex);
  if (error) throw error;
}

async function markInvalid(
  spread: ParsedSpread,
  reason: RejectionReason | null,
): Promise<void> {
  const { db } = await import('./db.js');
  const { error } = await db
    .from('spreads')
    .update({ valid: false, rejection_reason: reason })
    .eq('signature', spread.signature)
    .eq('log_index', spread.logIndex);
  if (error) throw error;
}
