/**
 * queries.ts: Supabase query helpers + row-to-domain mappers.
 *
 * Centralizes the shape of DB rows so component code stays clean.
 * If the schema changes, only this file needs updating.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WalletNode,
  SpreadEdge,
  ForfeitureRecord,
  TradeRecord,
  FeedEvent,
  PoolStatus,
  TopCarrier,
  WalletStatus,
} from '../types/spread';

// ---------------------------------------------------------------------------
// Row → Domain mappers
// ---------------------------------------------------------------------------

interface NodeRow {
  wallet: string;
  r_score: number | string;
  spread_count: number | string;
  status: WalletStatus;
  current_balance: number | string;
  peak_balance: number | string;
  quarantine_until: string | null;
}

function rowToNode(row: NodeRow): WalletNode {
  return {
    wallet: row.wallet,
    rScore: Number(row.r_score ?? 0),
    spreadCount: Number(row.spread_count ?? 0),
    status: row.status,
    currentBalance: Number(row.current_balance ?? 0),
    peakBalance: Number(row.peak_balance ?? 0),
    quarantineUntil: row.quarantine_until,
  };
}

interface SpreadRow {
  signature: string;
  log_index: number;
  sender: string;
  recipient: string;
  amount_tokens: number | string;
  observed_at: string;
  valid: boolean;
  rejection_reason: string | null;
}

function rowToSpread(row: SpreadRow): SpreadEdge {
  return {
    signature: row.signature,
    logIndex: row.log_index,
    sender: row.sender,
    recipient: row.recipient,
    amountTokens: Number(row.amount_tokens),
    observedAt: row.observed_at,
    valid: row.valid,
    rejectionReason: row.rejection_reason,
  };
}

interface ForfeitureRow {
  id: string;
  wallet: string;
  r_at_forfeit: number;
  peak_at_forfeit: number | string;
  drain_pct: number | string;
  trigger_signature: string | null;
  occurred_at: string;
  quarantine_until: string;
}

function rowToForfeiture(row: ForfeitureRow): ForfeitureRecord {
  return {
    id: row.id,
    wallet: row.wallet,
    rAtForfeit: Number(row.r_at_forfeit),
    peakAtForfeit: Number(row.peak_at_forfeit),
    drainPct: Number(row.drain_pct),
    triggerSignature: row.trigger_signature,
    occurredAt: row.occurred_at,
    quarantineUntil: row.quarantine_until,
  };
}

interface TradeRow {
  signature: string;
  observed_at: string;
  direction: 'buy' | 'sell';
  wallet_address: string;
  sol_amount: number | string;
  fee_amount_sol: number | string;
  venue: 'bonding_curve' | 'pumpswap';
}

function rowToTrade(row: TradeRow): TradeRecord {
  return {
    signature: row.signature,
    observedAt: row.observed_at,
    direction: row.direction,
    walletAddress: row.wallet_address,
    solAmount: Number(row.sol_amount),
    feeAmountSol: Number(row.fee_amount_sol),
    venue: row.venue,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadNodes(client: SupabaseClient): Promise<WalletNode[]> {
  const { data, error } = await client
    .from('infection_nodes')
    .select('*')
    .order('r_score', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => rowToNode(r as NodeRow));
}

export async function loadSpreads(
  client: SupabaseClient,
  validOnly = true,
  limit = 1000,
): Promise<SpreadEdge[]> {
  let q = client
    .from('spreads')
    .select(
      'signature, log_index, sender, recipient, amount_tokens, observed_at, valid, rejection_reason',
    )
    .order('observed_at', { ascending: false })
    .limit(limit);
  if (validOnly) q = q.eq('valid', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => rowToSpread(r as SpreadRow));
}

export async function loadTopCarriers(
  client: SupabaseClient,
  limit = 10,
): Promise<TopCarrier[]> {
  const { data, error } = await client
    .from('top_carriers')
    .select('*')
    .order('r_score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    wallet: r.wallet,
    rScore: Number(r.r_score),
    spreadCount: Number(r.spread_count),
    status: r.status as WalletStatus,
    currentBalance: Number(r.current_balance),
    peakBalance: Number(r.peak_balance),
    drainPct: Number(r.drain_pct),
  }));
}

export async function loadFeed(
  client: SupabaseClient,
  limit = 60,
): Promise<FeedEvent[]> {
  const [spreadsRes, forfRes, tradesRes] = await Promise.all([
    client
      .from('spreads')
      .select(
        'signature, log_index, sender, recipient, amount_tokens, observed_at, valid, rejection_reason',
      )
      .order('observed_at', { ascending: false })
      .limit(limit),
    client
      .from('forfeitures')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(limit / 2),
    client
      .from('trades')
      .select(
        'signature, observed_at, direction, wallet_address, sol_amount, fee_amount_sol, venue',
      )
      .order('observed_at', { ascending: false })
      .limit(limit / 2),
  ]);
  if (spreadsRes.error) throw spreadsRes.error;
  if (forfRes.error) throw forfRes.error;
  if (tradesRes.error) throw tradesRes.error;

  const events: FeedEvent[] = [];
  for (const s of spreadsRes.data ?? []) {
    const sp = rowToSpread(s as SpreadRow);
    events.push({ type: 'spread', at: sp.observedAt, data: sp });
  }
  for (const f of forfRes.data ?? []) {
    const fr = rowToForfeiture(f as ForfeitureRow);
    events.push({ type: 'forfeiture', at: fr.occurredAt, data: fr });
  }
  for (const t of tradesRes.data ?? []) {
    const tr = rowToTrade(t as TradeRow);
    events.push({ type: 'trade', at: tr.observedAt, data: tr });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events.slice(0, limit);
}

export async function loadForfeitures(
  client: SupabaseClient,
  limit = 10,
): Promise<ForfeitureRecord[]> {
  const { data, error } = await client
    .from('forfeitures')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToForfeiture(r as ForfeitureRow));
}

export async function loadPoolStatus(
  client: SupabaseClient,
): Promise<PoolStatus> {
  const { data, error } = await client
    .from('pool_status')
    .select('*')
    .limit(1)
    .single();
  if (error) throw error;
  return {
    activeCarriers: Number(data?.active_carriers ?? 0),
    totalR: Number(data?.total_r ?? 0),
    totalSpreads: Number(data?.total_spreads ?? 0),
    forfeitures24h: Number(data?.forfeitures_24h ?? 0),
    totalDistributedSol: Number(data?.total_distributed_sol ?? 0),
    lastTradeAt: data?.last_trade_at ?? null,
  };
}

// Re-export mappers for streaming subscribers
export { rowToNode, rowToSpread, rowToForfeiture, rowToTrade };
