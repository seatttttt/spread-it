'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  loadNodes,
  loadSpreads,
  loadTopCarriers,
  loadForfeitures,
  loadPoolStatus,
  loadFeed,
  rowToNode,
  rowToSpread,
} from '../lib/queries';
import {
  mockNodes,
  mockSpreads,
  mockTopCarriers,
  mockForfeitures,
  mockPoolStatus,
  mockFeed,
  subscribeMockEvents,
} from '../lib/mock-data';
import type {
  WalletNode,
  SpreadEdge,
  ForfeitureRecord,
  PoolStatus,
  TopCarrier,
  FeedEvent,
} from '../types/spread';

export type DataSource = 'mock' | 'supabase';

export interface SpreadData {
  nodes: WalletNode[];
  spreads: SpreadEdge[];
  topCarriers: TopCarrier[];
  forfeitures: ForfeitureRecord[];
  pool: PoolStatus;
  feed: FeedEvent[];
  lastEvent: FeedEvent | null;
  source: DataSource;
}

const FEED_CAP = 60;

export function useSpreadData(): SpreadData {
  const [nodes, setNodes] = useState<WalletNode[]>(() => mockNodes());
  const [spreads, setSpreads] = useState<SpreadEdge[]>(() => mockSpreads());
  const [topCarriers, setTopCarriers] = useState<TopCarrier[]>(() => mockTopCarriers());
  const [forfeitures, setForfeitures] = useState<ForfeitureRecord[]>(() => mockForfeitures());
  const [pool, setPool] = useState<PoolStatus>(() => mockPoolStatus());
  const [feed, setFeed] = useState<FeedEvent[]>(() => mockFeed());
  const [lastEvent, setLastEvent] = useState<FeedEvent | null>(null);
  const [source, setSource] = useState<DataSource>('mock');

  const liveCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Mock mode: start the live mock stream
      const unsub = subscribeMockEvents((event) => {
        setLastEvent(event);
        setFeed((prev) => [event, ...prev].slice(0, FEED_CAP));
      });
      liveCleanupRef.current = unsub;
      return () => unsub();
    }

    setSource('supabase');
    let cancelled = false;
    const client = supabase;

    async function init(): Promise<void> {
      try {
        const [n, s, tc, fr, ps, fd] = await Promise.all([
          loadNodes(client),
          loadSpreads(client, true, 1000),
          loadTopCarriers(client),
          loadForfeitures(client),
          loadPoolStatus(client),
          loadFeed(client),
        ]);
        if (cancelled) return;
        setNodes(n);
        setSpreads(s);
        setTopCarriers(tc);
        setForfeitures(fr);
        setPool(ps);
        setFeed(fd);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('initial load failed', err);
      }
    }
    void init();

    // Realtime subscriptions
    const channel = client
      .channel('spread-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_scores' },
        (payload) => {
          const newRow = (payload.new ?? payload.old) as Record<string, unknown>;
          if (!newRow?.wallet) return;
          // Refresh nodes + topCarriers (relatively cheap)
          void loadNodes(client).then(setNodes).catch(() => {});
          void loadTopCarriers(client).then(setTopCarriers).catch(() => {});
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'spreads' },
        (payload) => {
          const row = payload.new as Parameters<typeof rowToSpread>[0];
          if (!row) return;
          const sp = rowToSpread(row);
          if (sp.valid) {
            setSpreads((prev) => [sp, ...prev].slice(0, 1000));
          }
          const event: FeedEvent = { type: 'spread', at: sp.observedAt, data: sp };
          setLastEvent(event);
          setFeed((prev) => [event, ...prev].slice(0, FEED_CAP));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forfeitures' },
        (payload) => {
          const row = payload.new as {
            id: string;
            wallet: string;
            r_at_forfeit: number;
            peak_at_forfeit: number | string;
            drain_pct: number | string;
            trigger_signature: string | null;
            occurred_at: string;
            quarantine_until: string;
          };
          if (!row) return;
          const fr: ForfeitureRecord = {
            id: row.id,
            wallet: row.wallet,
            rAtForfeit: Number(row.r_at_forfeit),
            peakAtForfeit: Number(row.peak_at_forfeit),
            drainPct: Number(row.drain_pct),
            triggerSignature: row.trigger_signature,
            occurredAt: row.occurred_at,
            quarantineUntil: row.quarantine_until,
          };
          setForfeitures((prev) => [fr, ...prev].slice(0, 50));
          void loadPoolStatus(client).then(setPool).catch(() => {});
          const event: FeedEvent = { type: 'forfeiture', at: fr.occurredAt, data: fr };
          setLastEvent(event);
          setFeed((prev) => [event, ...prev].slice(0, FEED_CAP));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trades' },
        (payload) => {
          const row = payload.new as {
            signature: string;
            observed_at: string;
            direction: 'buy' | 'sell';
            wallet_address: string;
            sol_amount: number | string;
            fee_amount_sol: number | string;
            venue: 'bonding_curve' | 'pumpswap';
          };
          if (!row) return;
          const event: FeedEvent = {
            type: 'trade',
            at: row.observed_at,
            data: {
              signature: row.signature,
              observedAt: row.observed_at,
              direction: row.direction,
              walletAddress: row.wallet_address,
              solAmount: Number(row.sol_amount),
              feeAmountSol: Number(row.fee_amount_sol),
              venue: row.venue,
            },
          };
          setLastEvent(event);
          setFeed((prev) => [event, ...prev].slice(0, FEED_CAP));
          void loadPoolStatus(client).then(setPool).catch(() => {});
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_peaks' },
        (payload) => {
          const row = payload.new as Parameters<typeof rowToNode>[0] | undefined;
          if (!row?.wallet) return;
          // Lightweight node update: patch in place
          setNodes((prev) => {
            const existing = prev.find((n) => n.wallet === row.wallet);
            if (existing) {
              return prev.map((n) =>
                n.wallet === row.wallet
                  ? {
                      ...n,
                      currentBalance: Number(
                        (row as { current_balance?: number | string }).current_balance ?? 0,
                      ),
                      peakBalance: Number(
                        (row as { peak_balance?: number | string }).peak_balance ?? 0,
                      ),
                    }
                  : n,
              );
            }
            // New holder: refresh full set lazily
            void loadNodes(client).then(setNodes).catch(() => {});
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, []);

  return {
    nodes,
    spreads,
    topCarriers,
    forfeitures,
    pool,
    feed,
    lastEvent,
    source,
  };
}
