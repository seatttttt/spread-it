/**
 * pump.ts — Helius webhook event parsing for $SPREAD.
 *
 * Two event kinds we care about:
 *   1. SWAP  — DEX swap on pump.fun bonding curve or PumpSwap.
 *              Generates creator fees, distributed R-weighted.
 *   2. SPREAD — wallet-to-wallet transfer of our token (no DEX).
 *               Candidate for R credit if it passes anti-sybil + eligibility.
 *
 * Reference (verify at impl time):
 *   https://docs.helius.dev/data-streaming/enhanced-transactions
 */

import { logger } from './logger.js';

export type SwapDirection = 'buy' | 'sell';
export type SwapVenue = 'bonding_curve' | 'pumpswap';

export interface ParsedSwap {
  kind: 'swap';
  signature: string;
  slot: number;
  onChainAt: Date;
  direction: SwapDirection;
  walletAddress: string;
  solAmount: number;
  tokenAmount: number;
  feeAmountSol: number;
  venue: SwapVenue;
  raw?: unknown;
}

export interface ParsedSpread {
  kind: 'spread';
  signature: string;
  logIndex: number;
  slot: number;
  onChainAt: Date;
  sender: string;
  recipient: string;
  amountTokens: number;
  raw?: unknown;
}

export type ParsedEvent = ParsedSwap | ParsedSpread;

export const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_SWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

interface HeliusTokenTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  fromTokenAccount?: string | null;
  toTokenAccount?: string | null;
  mint?: string;
  tokenAmount?: number;
}

interface HeliusNativeTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  amount?: number;
}

interface HeliusInstruction {
  programId?: string;
  accounts?: string[];
  innerInstructions?: HeliusInstruction[];
}

interface HeliusEnhancedTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  type?: string;
  source?: string;
  feePayer?: string;
  description?: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  instructions?: HeliusInstruction[];
  fee?: number;
}

/**
 * Returns true if this tx involves a pump.fun / PumpSwap program (i.e. is a DEX swap).
 */
function involvesDexProgram(tx: HeliusEnhancedTransaction): boolean {
  function walk(ixs: HeliusInstruction[] | undefined): boolean {
    if (!ixs) return false;
    for (const ix of ixs) {
      if (ix.programId === PUMP_FUN_PROGRAM) return true;
      if (ix.programId === PUMP_SWAP_PROGRAM) return true;
      if (walk(ix.innerInstructions)) return true;
    }
    return false;
  }
  return walk(tx.instructions);
}

function venueOf(tx: HeliusEnhancedTransaction): SwapVenue | null {
  function walk(ixs: HeliusInstruction[] | undefined): SwapVenue | null {
    if (!ixs) return null;
    for (const ix of ixs) {
      if (ix.programId === PUMP_FUN_PROGRAM) return 'bonding_curve';
      if (ix.programId === PUMP_SWAP_PROGRAM) return 'pumpswap';
      const nested = walk(ix.innerInstructions);
      if (nested) return nested;
    }
    return null;
  }
  const fromIx = walk(tx.instructions);
  if (fromIx) return fromIx;
  if (tx.source === 'PUMP_FUN') return 'bonding_curve';
  if (tx.source === 'PUMPSWAP') return 'pumpswap';
  return null;
}

/**
 * Parse a SWAP event. Returns null if it isn't a relevant swap of our mint.
 */
function parseSwap(
  tx: HeliusEnhancedTransaction,
  tokenMint: string,
): ParsedSwap | null {
  const venue = venueOf(tx);
  if (!venue) return null;

  const ourTokenTransfer = (tx.tokenTransfers ?? []).find(
    (t) => t.mint === tokenMint,
  );
  if (!ourTokenTransfer) return null;

  // The user wallet is the fee payer (pools / PDAs do not pay tx fees).
  const wallet = tx.feePayer ?? '';
  if (!wallet) return null;

  let direction: SwapDirection;
  if (ourTokenTransfer.toUserAccount === wallet) direction = 'buy';
  else if (ourTokenTransfer.fromUserAccount === wallet) direction = 'sell';
  else return null;

  const nativeTransfers = tx.nativeTransfers ?? [];
  const solLamports = nativeTransfers
    .filter((t) => t.fromUserAccount === wallet || t.toUserAccount === wallet)
    .reduce((max, t) => Math.max(max, t.amount ?? 0), 0);
  const solAmount = solLamports / 1_000_000_000;

  // Bonding curve: 0.30% creator fee. PumpSwap: ~0.85% (varies with MC).
  // TODO: dynamic fee tier lookup based on current MC.
  const feeRatePct = venue === 'bonding_curve' ? 0.3 : 0.85;
  const feeAmountSol = (solAmount * feeRatePct) / 100;

  const tokenAmount = ourTokenTransfer.tokenAmount ?? 0;

  return {
    kind: 'swap',
    signature: tx.signature,
    slot: tx.slot,
    onChainAt: new Date(tx.timestamp * 1000),
    direction,
    walletAddress: wallet,
    solAmount,
    tokenAmount,
    feeAmountSol,
    venue,
    raw: tx,
  };
}

/**
 * Parse SPREAD event(s) — wallet-to-wallet transfers of our mint that are NOT
 * mediated by a DEX program. A single tx can carry multiple token transfers,
 * so we yield one ParsedSpread per qualifying transfer.
 */
function parseSpreads(
  tx: HeliusEnhancedTransaction,
  tokenMint: string,
): ParsedSpread[] {
  if (involvesDexProgram(tx)) return [];

  const out: ParsedSpread[] = [];
  let logIndex = 0;
  for (const t of tx.tokenTransfers ?? []) {
    if (t.mint !== tokenMint) continue;
    if (!t.fromUserAccount || !t.toUserAccount) continue;
    if (t.fromUserAccount === t.toUserAccount) continue;
    const amount = t.tokenAmount ?? 0;
    if (amount <= 0) continue;

    out.push({
      kind: 'spread',
      signature: tx.signature,
      logIndex: logIndex++,
      slot: tx.slot,
      onChainAt: new Date(tx.timestamp * 1000),
      sender: t.fromUserAccount,
      recipient: t.toUserAccount,
      amountTokens: amount,
      raw: tx,
    });
  }
  return out;
}

/**
 * Parse a single Helius enhanced transaction into one or more ParsedEvents.
 */
export function parseHeliusTransaction(
  tx: HeliusEnhancedTransaction,
  tokenMint: string,
): ParsedEvent[] {
  if (!tx.signature || !tx.slot) return [];

  const swap = parseSwap(tx, tokenMint);
  if (swap) return [swap];

  return parseSpreads(tx, tokenMint);
}

/**
 * Parse a Helius webhook payload (which may be an array of transactions).
 */
export function parseHeliusWebhookPayload(
  payload: unknown,
  tokenMint: string,
): ParsedEvent[] {
  if (!payload) return [];
  const arr = Array.isArray(payload) ? payload : [payload];
  const out: ParsedEvent[] = [];
  for (const tx of arr) {
    try {
      const events = parseHeliusTransaction(
        tx as HeliusEnhancedTransaction,
        tokenMint,
      );
      out.push(...events);
    } catch (err) {
      logger.warn(
        { err, signature: (tx as { signature?: string })?.signature },
        'parse failed',
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mocks (for local dev — POST /test/swap, /test/spread)
// ---------------------------------------------------------------------------

export function buildMockSwap(spec: {
  direction: SwapDirection;
  walletAddress: string;
  solAmount: number;
  tokenAmount?: number;
  venue?: SwapVenue;
}): ParsedSwap {
  const venue = spec.venue ?? 'bonding_curve';
  const feeRatePct = venue === 'bonding_curve' ? 0.3 : 0.85;
  return {
    kind: 'swap',
    signature: `mock-swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slot: Math.floor(Date.now() / 400),
    onChainAt: new Date(),
    direction: spec.direction,
    walletAddress: spec.walletAddress,
    solAmount: spec.solAmount,
    tokenAmount: spec.tokenAmount ?? spec.solAmount * 1_000_000,
    feeAmountSol: (spec.solAmount * feeRatePct) / 100,
    venue,
  };
}

export function buildMockSpread(spec: {
  sender: string;
  recipient: string;
  amountTokens: number;
}): ParsedSpread {
  return {
    kind: 'spread',
    signature: `mock-spread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    logIndex: 0,
    slot: Math.floor(Date.now() / 400),
    onChainAt: new Date(),
    sender: spec.sender,
    recipient: spec.recipient,
    amountTokens: spec.amountTokens,
  };
}
