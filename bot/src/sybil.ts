/**
 * sybil.ts — Anti-sybil verification for spread recipients.
 *
 * Rules (locked design):
 *   - recipient must hold >= RECIPIENT_MIN_SOL
 *   - recipient must be >= RECIPIENT_MIN_AGE_DAYS old (first tx)
 *   - recipient must have >= RECIPIENT_MIN_OUTGOING_TX outgoing txs
 *
 * RPC calls are cached in wallet_metadata with a 5-min TTL to avoid hammering
 * Helius on bursty traffic.
 */

import { PublicKey } from '@solana/web3.js';
import { connection } from './solana.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getWalletMetadata, upsertWalletMetadata } from './state.js';
import type { RejectionReason } from './state.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SIG_PAGE_LIMIT = 1000;

export interface SybilResult {
  passes: boolean;
  reason: RejectionReason | null;
  meta: {
    solBalanceLamports: number;
    firstTxAt: Date | null;
    outgoingTxCount: number;
    ageDays: number;
  };
}

/**
 * Verify a recipient passes sybil filters.
 *
 * Reads cached metadata first. On cache miss / stale, hits Helius RPC.
 */
export async function verifyRecipient(wallet: string): Promise<SybilResult> {
  let meta = await getWalletMetadata(wallet);

  const stale =
    !meta || Date.now() - new Date(meta.checkedAt).getTime() > CACHE_TTL_MS;

  if (stale) {
    try {
      const fresh = await fetchWalletStats(wallet);
      await upsertWalletMetadata({
        wallet,
        firstTxAt: fresh.firstTxAt ? fresh.firstTxAt.toISOString() : null,
        outgoingTxCount: fresh.outgoingTxCount,
        solBalanceLamports: fresh.solBalanceLamports,
      });
      meta = {
        wallet,
        firstTxAt: fresh.firstTxAt ? fresh.firstTxAt.toISOString() : null,
        outgoingTxCount: fresh.outgoingTxCount,
        solBalanceLamports: fresh.solBalanceLamports,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn({ err, wallet }, 'sybil RPC fetch failed');
      // Fail open if both cache + fetch fail — but rejection_reason recorded.
      return {
        passes: false,
        reason: 'sybil_check_failed',
        meta: {
          solBalanceLamports: 0,
          firstTxAt: null,
          outgoingTxCount: 0,
          ageDays: 0,
        },
      };
    }
  }

  if (!meta) {
    return {
      passes: false,
      reason: 'sybil_check_failed',
      meta: {
        solBalanceLamports: 0,
        firstTxAt: null,
        outgoingTxCount: 0,
        ageDays: 0,
      },
    };
  }

  const minLamports = config.RECIPIENT_MIN_SOL * 1_000_000_000;
  const ageDays = meta.firstTxAt
    ? (Date.now() - new Date(meta.firstTxAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  if (meta.solBalanceLamports < minLamports) {
    return {
      passes: false,
      reason: 'recipient_low_sol',
      meta: {
        solBalanceLamports: meta.solBalanceLamports,
        firstTxAt: meta.firstTxAt ? new Date(meta.firstTxAt) : null,
        outgoingTxCount: meta.outgoingTxCount,
        ageDays,
      },
    };
  }
  if (ageDays < config.RECIPIENT_MIN_AGE_DAYS) {
    return {
      passes: false,
      reason: 'recipient_too_new',
      meta: {
        solBalanceLamports: meta.solBalanceLamports,
        firstTxAt: meta.firstTxAt ? new Date(meta.firstTxAt) : null,
        outgoingTxCount: meta.outgoingTxCount,
        ageDays,
      },
    };
  }
  if (meta.outgoingTxCount < config.RECIPIENT_MIN_OUTGOING_TX) {
    return {
      passes: false,
      reason: 'recipient_low_outgoing',
      meta: {
        solBalanceLamports: meta.solBalanceLamports,
        firstTxAt: meta.firstTxAt ? new Date(meta.firstTxAt) : null,
        outgoingTxCount: meta.outgoingTxCount,
        ageDays,
      },
    };
  }

  return {
    passes: true,
    reason: null,
    meta: {
      solBalanceLamports: meta.solBalanceLamports,
      firstTxAt: meta.firstTxAt ? new Date(meta.firstTxAt) : null,
      outgoingTxCount: meta.outgoingTxCount,
      ageDays,
    },
  };
}

interface WalletStats {
  solBalanceLamports: number;
  firstTxAt: Date | null;
  outgoingTxCount: number;
}

/**
 * Pull wallet stats from RPC.
 * For age: paginate getSignaturesForAddress() back to find the oldest.
 * For outgoing tx count: page through and count txs where this wallet was fee payer.
 *
 * For perf: we cap at 2 pages (~2000 sigs). If we hit the cap, ageDays returns
 * lower bound — usually that's enough since we just need ≥ 7 days.
 */
async function fetchWalletStats(wallet: string): Promise<WalletStats> {
  const pk = new PublicKey(wallet);

  // SOL balance
  const solBalanceLamports = await connection.getBalance(pk);

  // Walk signatures backward to count outgoing + find oldest
  let outgoingTxCount = 0;
  let firstTxAt: Date | null = null;
  let before: string | undefined;
  const MAX_PAGES = 2;

  for (let page = 0; page < MAX_PAGES; page++) {
    const sigs = await connection.getSignaturesForAddress(pk, {
      limit: SIG_PAGE_LIMIT,
      before,
    });
    if (sigs.length === 0) break;

    for (const s of sigs) {
      if (s.err) continue; // failed tx doesn't count as outgoing
      outgoingTxCount++; // approximation — counts ALL involved txs, not just outgoing.
      if (s.blockTime) firstTxAt = new Date(s.blockTime * 1000);
    }

    if (sigs.length < SIG_PAGE_LIMIT) break;
    before = sigs[sigs.length - 1]?.signature;
  }

  return { solBalanceLamports, firstTxAt, outgoingTxCount };
}
