/**
 * Mock data generators: used when Supabase env vars are missing
 * (preview mode for design iteration without standing up DB).
 *
 * IMPORTANT: All initial-state functions are PURE / DETERMINISTIC.
 * Each call returns the same data given the same seed. Required to avoid
 * Next.js hydration mismatches between SSR and CSR.
 *
 * Live functions (subscribeMockEvents) use Math.random: only called inside
 * useEffect (client-only).
 */

import type {
  WalletNode,
  SpreadEdge,
  ForfeitureRecord,
  PoolStatus,
  TopCarrier,
  FeedEvent,
  TradeRecord,
} from '../types/spread';

// ---------------------------------------------------------------------------
// Pure deterministic helpers
// ---------------------------------------------------------------------------

function hash(n: number): number {
  let h = n | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return h >>> 0;
}

function det(key: number): number {
  return hash(key) / 0x100000000;
}

function detWallet(key: number): string {
  const h = hash(key).toString(16).padStart(8, '0');
  const t = hash(key * 17).toString(16).padStart(8, '0');
  return `${h}${t}${'a'.repeat(28)}`.slice(0, 44);
}

const PATIENT_ZERO = 'PZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// ---------------------------------------------------------------------------
// Initial state: fully deterministic
// ---------------------------------------------------------------------------

const TOTAL_NODES = 32;
const ACTIVE_NODES = 8; // wallets that have earned R
const QUARANTINED_NODES = 2;

export function mockNodes(): WalletNode[] {
  const out: WalletNode[] = [];

  // Patient Zero
  out.push({
    wallet: PATIENT_ZERO,
    rScore: 10,
    spreadCount: 0,
    status: 'patient_zero',
    currentBalance: 51_100_000,
    peakBalance: 51_100_000,
    quarantineUntil: null,
  });

  // Active carriers
  for (let i = 0; i < ACTIVE_NODES; i++) {
    const r = Math.floor(1 + det(i * 7) * 12);
    out.push({
      wallet: detWallet(100 + i),
      rScore: r,
      spreadCount: r,
      status: 'active',
      currentBalance: 1_500_000 + Math.floor(det(i * 11) * 8_000_000),
      peakBalance: 2_000_000 + Math.floor(det(i * 13) * 9_000_000),
      quarantineUntil: null,
    });
  }

  // Quarantined wallets
  for (let i = 0; i < QUARANTINED_NODES; i++) {
    out.push({
      wallet: detWallet(500 + i),
      rScore: 0,
      spreadCount: Math.floor(2 + det(i * 17) * 5),
      status: 'quarantined',
      currentBalance: 200_000 + Math.floor(det(i * 19) * 500_000),
      peakBalance: 5_000_000 + Math.floor(det(i * 23) * 5_000_000),
      quarantineUntil: new Date(Date.now() + (5 + det(i * 29) * 18) * 3600 * 1000).toISOString(),
    });
  }

  // Dormant holders (orbital)
  for (let i = 0; i < TOTAL_NODES - ACTIVE_NODES - QUARANTINED_NODES - 1; i++) {
    out.push({
      wallet: detWallet(1000 + i),
      rScore: 0,
      spreadCount: 0,
      status: 'active',
      currentBalance: 200_000 + Math.floor(det(i * 31) * 3_000_000),
      peakBalance: 200_000 + Math.floor(det(i * 31) * 3_000_000),
      quarantineUntil: null,
    });
  }
  return out;
}

export function mockSpreads(): SpreadEdge[] {
  const out: SpreadEdge[] = [];
  const baseTime = 1715000000000;
  // Build a small infection lineage from PZ → carriers
  const carriers = Array.from({ length: ACTIVE_NODES }, (_, i) => detWallet(100 + i));
  for (let i = 0; i < carriers.length; i++) {
    out.push({
      signature: `mock-spread-${i}-${PATIENT_ZERO.slice(0, 4)}`,
      logIndex: 0,
      sender: PATIENT_ZERO,
      recipient: carriers[i]!,
      amountTokens: 100_000 + Math.floor(det(i * 41) * 400_000),
      observedAt: new Date(baseTime - i * 60_000).toISOString(),
      valid: true,
      rejectionReason: null,
    });
  }
  // Then carrier → carrier secondary infections
  for (let i = 0; i < 6; i++) {
    const a = i % carriers.length;
    const b = (i + 2) % carriers.length;
    if (a === b) continue;
    out.push({
      signature: `mock-spread-sec-${i}`,
      logIndex: 0,
      sender: carriers[a]!,
      recipient: carriers[b]!,
      amountTokens: 50_000 + Math.floor(det(i * 43) * 200_000),
      observedAt: new Date(baseTime - 60_000 * (carriers.length + i)).toISOString(),
      valid: true,
      rejectionReason: null,
    });
  }
  return out;
}

export function mockTopCarriers(): TopCarrier[] {
  return Array.from({ length: ACTIVE_NODES }, (_, i) => {
    const r = Math.floor(1 + det(i * 7) * 12);
    return {
      wallet: detWallet(100 + i),
      rScore: r,
      spreadCount: r,
      status: 'active' as const,
      currentBalance: 1_500_000 + Math.floor(det(i * 11) * 8_000_000),
      peakBalance: 2_000_000 + Math.floor(det(i * 13) * 9_000_000),
      drainPct: det(i * 53) * 25,
    };
  }).sort((a, b) => b.rScore - a.rScore);
}

export function mockForfeitures(): ForfeitureRecord[] {
  const baseTime = 1715000000000;
  return Array.from({ length: QUARANTINED_NODES }, (_, i) => ({
    id: `mock-forf-${i}`,
    wallet: detWallet(500 + i),
    rAtForfeit: Math.floor(2 + det(i * 17) * 5),
    peakAtForfeit: 5_000_000 + Math.floor(det(i * 23) * 5_000_000),
    drainPct: 41 + det(i * 19) * 30,
    triggerSignature: `mock-trigger-${i}`,
    occurredAt: new Date(baseTime - (i + 1) * 600_000).toISOString(),
    quarantineUntil: new Date(Date.now() + (5 + det(i * 29) * 18) * 3600 * 1000).toISOString(),
  }));
}

export function mockPoolStatus(): PoolStatus {
  return {
    activeCarriers: ACTIVE_NODES,
    totalR: 38,
    totalSpreads: 38,
    forfeitures24h: QUARANTINED_NODES,
    totalDistributedSol: 12.483,
    lastTradeAt: new Date(Date.now() - 4_000).toISOString(),
  };
}

export function mockFeed(n = 30): FeedEvent[] {
  const baseTime = 1715000000000;
  const out: FeedEvent[] = [];
  const carriers = Array.from({ length: ACTIVE_NODES }, (_, i) => detWallet(100 + i));
  for (let i = 0; i < n; i++) {
    const at = new Date(baseTime - i * 4000).toISOString();
    const r = det(i * 71);
    if (r < 0.18) {
      // spread
      const a = Math.floor(det(i * 73) * carriers.length);
      const b = Math.floor(det(i * 79) * carriers.length);
      const sender = a === b ? PATIENT_ZERO : carriers[a]!;
      out.push({
        type: 'spread',
        at,
        data: {
          signature: `mock-${i}`,
          logIndex: 0,
          sender,
          recipient: carriers[b]!,
          amountTokens: 100_000 + Math.floor(det(i * 81) * 400_000),
          observedAt: at,
          valid: det(i * 83) > 0.2,
          rejectionReason: det(i * 83) > 0.2 ? null : 'recipient_low_sol',
        },
      });
    } else if (r < 0.22) {
      // forfeiture
      out.push({
        type: 'forfeiture',
        at,
        data: {
          id: `mock-f-${i}`,
          wallet: detWallet(500 + i),
          rAtForfeit: Math.floor(2 + det(i * 87) * 5),
          peakAtForfeit: 5_000_000 + Math.floor(det(i * 89) * 5_000_000),
          drainPct: 41 + det(i * 91) * 30,
          triggerSignature: `mock-${i}`,
          occurredAt: at,
          quarantineUntil: new Date(new Date(at).getTime() + 24 * 3600_000).toISOString(),
        },
      });
    } else {
      // trade
      const direction = det(i * 89) < 0.6 ? 'buy' : 'sell';
      const sol = det(i * 97) * 2;
      out.push({
        type: 'trade',
        at,
        data: {
          signature: `mock-trade-${i}`,
          observedAt: at,
          direction,
          walletAddress: detWallet(i * 101),
          solAmount: sol,
          feeAmountSol: sol * 0.0085,
          venue: 'pumpswap',
        } as TradeRecord,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live mock subscription: client-only, uses Math.random
// ---------------------------------------------------------------------------

export function subscribeMockEvents(cb: (event: FeedEvent) => void): () => void {
  let cancelled = false;
  const carriers = Array.from({ length: ACTIVE_NODES }, (_, i) => detWallet(100 + i));

  function emit(): void {
    if (cancelled) return;
    const r = Math.random();
    const at = new Date().toISOString();
    if (r < 0.18) {
      const a = Math.floor(Math.random() * carriers.length);
      const b = Math.floor(Math.random() * carriers.length);
      cb({
        type: 'spread',
        at,
        data: {
          signature: `live-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          logIndex: 0,
          sender: a === b ? PATIENT_ZERO : carriers[a]!,
          recipient: carriers[b]!,
          amountTokens: 100_000 + Math.random() * 400_000,
          observedAt: at,
          valid: Math.random() > 0.25,
          rejectionReason: Math.random() > 0.25 ? null : 'recipient_low_sol',
        },
      });
    } else if (r < 0.22) {
      cb({
        type: 'forfeiture',
        at,
        data: {
          id: `live-f-${Date.now()}`,
          wallet: `0x${Math.random().toString(16).slice(2, 10)}`,
          rAtForfeit: 1 + Math.floor(Math.random() * 5),
          peakAtForfeit: 5_000_000,
          drainPct: 40 + Math.random() * 30,
          triggerSignature: 'live-trigger',
          occurredAt: at,
          quarantineUntil: new Date(Date.now() + 24 * 3600_000).toISOString(),
        },
      });
    } else {
      const direction: 'buy' | 'sell' = Math.random() < 0.6 ? 'buy' : 'sell';
      const sol = Math.random() * 2;
      cb({
        type: 'trade',
        at,
        data: {
          signature: `live-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          observedAt: at,
          direction,
          walletAddress: `0x${Math.random().toString(16).slice(2, 10)}`,
          solAmount: sol,
          feeAmountSol: sol * 0.0085,
          venue: 'pumpswap',
        },
      });
    }
    setTimeout(emit, 1500 + Math.random() * 2500);
  }

  setTimeout(emit, 800);
  return () => {
    cancelled = true;
  };
}
