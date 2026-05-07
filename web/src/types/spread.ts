/**
 * Shared types: kept in sync with Supabase schema (supabase/migrations/0001_init.sql).
 */

export type WalletStatus = 'active' | 'quarantined' | 'patient_zero';

export interface WalletNode {
  wallet: string;
  rScore: number;
  spreadCount: number;
  status: WalletStatus;
  currentBalance: number;
  peakBalance: number;
  quarantineUntil: string | null;
}

export interface SpreadEdge {
  signature: string;
  logIndex: number;
  sender: string;
  recipient: string;
  amountTokens: number;
  observedAt: string;
  valid: boolean;
  rejectionReason: string | null;
}

export interface ForfeitureRecord {
  id: string;
  wallet: string;
  rAtForfeit: number;
  peakAtForfeit: number;
  drainPct: number;
  triggerSignature: string | null;
  occurredAt: string;
  quarantineUntil: string;
}

export interface TradeRecord {
  signature: string;
  observedAt: string;
  direction: 'buy' | 'sell';
  walletAddress: string;
  solAmount: number;
  feeAmountSol: number;
  venue: 'bonding_curve' | 'pumpswap';
}

export type FeedEvent =
  | { type: 'spread'; at: string; data: SpreadEdge }
  | { type: 'forfeiture'; at: string; data: ForfeitureRecord }
  | { type: 'trade'; at: string; data: TradeRecord };

export interface PoolStatus {
  activeCarriers: number;
  totalR: number;
  totalSpreads: number;
  forfeitures24h: number;
  totalDistributedSol: number;
  lastTradeAt: string | null;
}

export interface TopCarrier {
  wallet: string;
  rScore: number;
  spreadCount: number;
  status: WalletStatus;
  currentBalance: number;
  peakBalance: number;
  drainPct: number;
}
