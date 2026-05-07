/**
 * state.ts — Database operations layer.
 * Wraps Supabase calls so business logic doesn't deal with raw SQL.
 */

import { db } from './db.js';
import { config } from './config.js';
import type { ParsedSwap, ParsedSpread } from './pump.js';

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/** Insert trade (idempotent by signature PK). Returns true if new. */
export async function recordTrade(swap: ParsedSwap): Promise<boolean> {
  const { error } = await db.from('trades').insert({
    signature: swap.signature,
    slot: swap.slot,
    on_chain_at: swap.onChainAt.toISOString(),
    direction: swap.direction,
    wallet_address: swap.walletAddress,
    sol_amount: swap.solAmount,
    token_amount: swap.tokenAmount,
    fee_amount_sol: swap.feeAmountSol,
    venue: swap.venue,
  });
  if (error) {
    if (error.code === '23505') return false;
    throw error;
  }
  return true;
}

export async function markTradeDistributed(signature: string): Promise<void> {
  const { error } = await db
    .from('trades')
    .update({ distributed: true })
    .eq('signature', signature);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Spreads
// ---------------------------------------------------------------------------

export type RejectionReason =
  | 'amount_below_min'
  | 'sender_below_carrier_min'
  | 'sender_quarantined'
  | 'recipient_low_sol'
  | 'recipient_too_new'
  | 'recipient_low_outgoing'
  | 'pair_already_spread'
  | 'self_transfer'
  | 'patient_zero_excluded'
  | 'sybil_check_failed';

/** Insert spread row (idempotent on signature+log_index). Returns true if new. */
export async function recordSpread(
  spread: ParsedSpread,
  valid: boolean,
  rejectionReason: RejectionReason | null,
): Promise<boolean> {
  const { error } = await db.from('spreads').insert({
    signature: spread.signature,
    log_index: spread.logIndex,
    slot: spread.slot,
    on_chain_at: spread.onChainAt.toISOString(),
    sender: spread.sender,
    recipient: spread.recipient,
    amount_tokens: spread.amountTokens,
    valid,
    rejection_reason: rejectionReason,
  });
  if (error) {
    if (error.code === '23505') return false;
    throw error;
  }
  return true;
}

/** Was this (sender, recipient) pair ever credited as a valid spread? */
export async function hasValidSpread(
  sender: string,
  recipient: string,
): Promise<boolean> {
  const { count, error } = await db
    .from('spreads')
    .select('*', { count: 'exact', head: true })
    .eq('sender', sender)
    .eq('recipient', recipient)
    .eq('valid', true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Wallet scores
// ---------------------------------------------------------------------------

export interface WalletScore {
  wallet: string;
  rScore: number;
  spreadCount: number;
  status: 'active' | 'quarantined' | 'patient_zero';
  quarantineUntil: string | null;
}

export async function getWalletScore(wallet: string): Promise<WalletScore | null> {
  const { data, error } = await db
    .from('wallet_scores')
    .select('wallet, r_score, spread_count, status, quarantine_until')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    wallet: data.wallet,
    rScore: Number(data.r_score),
    spreadCount: Number(data.spread_count),
    status: data.status,
    quarantineUntil: data.quarantine_until,
  };
}

/** Atomic +1 R for wallet (calls SQL fn credit_r). */
export async function creditR(wallet: string): Promise<void> {
  const { error } = await db.rpc('credit_r', { p_wallet: wallet });
  if (error) throw error;
}

/** Atomic forfeit (R reset, quarantine) — calls SQL fn forfeit_wallet. */
export async function forfeitWallet(
  wallet: string,
  triggerSignature: string | null,
  quarantineHours: number = config.QUARANTINE_HOURS,
): Promise<void> {
  const { error } = await db.rpc('forfeit_wallet', {
    p_wallet: wallet,
    p_trigger_signature: triggerSignature,
    p_quarantine_hours: quarantineHours,
  });
  if (error) throw error;
}

/** Bootstrap Patient Zero — idempotent. */
export async function bootstrapPatientZero(
  wallet: string,
  rFloor: number,
): Promise<void> {
  const { error } = await db.rpc('bootstrap_patient_zero', {
    p_wallet: wallet,
    p_r_floor: rFloor,
  });
  if (error) throw error;
}

/** Expire quarantines that have passed their cooldown. */
export async function expireQuarantines(): Promise<number> {
  const { data, error } = await db.rpc('expire_quarantines');
  if (error) throw error;
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------
// Wallet peaks
// ---------------------------------------------------------------------------

export interface PeakUpdate {
  currentBalance: number;
  peakBalance: number;
  totalDrain: number;
  totalSpreadOutflow: number;
  drainPct: number;
}

export interface WalletPeak {
  wallet: string;
  currentBalance: number;
  peakBalance: number;
  totalDrain: number;
  totalSpreadOutflow: number;
}

/**
 * Update a wallet's balance + peak + drain in one atomic call.
 * positive delta = inflow; negative delta = outflow.
 * outflowKind = 'spread' (excluded from drain) | 'drain' (counted) | undefined for inflows.
 */
export async function updateBalance(
  wallet: string,
  delta: number,
  outflowKind: 'spread' | 'drain' | null = null,
): Promise<PeakUpdate> {
  const { data, error } = await db.rpc('update_balance', {
    p_wallet: wallet,
    p_delta: delta,
    p_outflow_kind: outflowKind,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    currentBalance: Number(row?.current_balance ?? 0),
    peakBalance: Number(row?.peak_balance ?? 0),
    totalDrain: Number(row?.total_drain ?? 0),
    totalSpreadOutflow: Number(row?.total_spread_outflow ?? 0),
    drainPct: Number(row?.drain_pct ?? 0),
  };
}

export async function getWalletPeak(wallet: string): Promise<WalletPeak | null> {
  const { data, error } = await db
    .from('wallet_peaks')
    .select('wallet, current_balance, peak_balance, total_drain, total_spread_outflow')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    wallet: data.wallet,
    currentBalance: Number(data.current_balance),
    peakBalance: Number(data.peak_balance),
    totalDrain: Number(data.total_drain),
    totalSpreadOutflow: Number(data.total_spread_outflow),
  };
}

/** Direct upsert for seed-time bulk loading of holder snapshots. */
export async function upsertWalletPeakRaw(
  wallet: string,
  currentBalance: number,
  peakBalance: number,
): Promise<void> {
  const { error } = await db.from('wallet_peaks').upsert({
    wallet,
    current_balance: currentBalance,
    peak_balance: peakBalance,
    last_updated: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Wallet metadata (anti-sybil cache)
// ---------------------------------------------------------------------------

export interface WalletMetadata {
  wallet: string;
  firstTxAt: string | null;
  outgoingTxCount: number;
  solBalanceLamports: number;
  checkedAt: string;
}

export async function getWalletMetadata(
  wallet: string,
): Promise<WalletMetadata | null> {
  const { data, error } = await db
    .from('wallet_metadata')
    .select('wallet, first_tx_at, outgoing_tx_count, sol_balance_lamports, checked_at')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    wallet: data.wallet,
    firstTxAt: data.first_tx_at,
    outgoingTxCount: Number(data.outgoing_tx_count),
    solBalanceLamports: Number(data.sol_balance_lamports),
    checkedAt: data.checked_at,
  };
}

export async function upsertWalletMetadata(
  meta: Omit<WalletMetadata, 'checkedAt'>,
): Promise<void> {
  const { error } = await db.from('wallet_metadata').upsert({
    wallet: meta.wallet,
    first_tx_at: meta.firstTxAt,
    outgoing_tx_count: meta.outgoingTxCount,
    sol_balance_lamports: meta.solBalanceLamports,
    checked_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

export async function recordDistributions(
  rows: Array<{
    tradeSignature: string;
    recipientWallet: string;
    rShare: number;
    totalR: number;
    amountSol: number;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from('distributions').insert(
    rows.map((r) => ({
      trade_signature: r.tradeSignature,
      recipient_wallet: r.recipientWallet,
      r_share: r.rShare,
      total_r: r.totalR,
      amount_sol: r.amountSol,
      status: 'pending',
    })),
  );
  if (error && error.code !== '23505') throw error;
}

// ---------------------------------------------------------------------------
// Carrier eligibility list (for distribution + leaderboard)
// ---------------------------------------------------------------------------

export interface ActiveCarrier {
  wallet: string;
  rScore: number;
  status: WalletScore['status'];
}

/**
 * Returns wallets eligible to receive a distribution share.
 * Excludes Patient Zero (per design — ornamental only).
 * Excludes quarantined wallets.
 */
export async function getDistributionEligible(): Promise<ActiveCarrier[]> {
  const { data, error } = await db
    .from('wallet_scores')
    .select('wallet, r_score, status')
    .eq('status', 'active')
    .gt('r_score', 0)
    .order('r_score', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    wallet: r.wallet,
    rScore: Number(r.r_score),
    status: r.status,
  }));
}
