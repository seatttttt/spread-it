'use client';

import { useState } from 'react';
import { useSpreadData } from '../hooks/useSpreadData';
import { InfectionTree } from './InfectionTree';
import { LiveFeed } from './sidebar/LiveFeed';
import { TopCarriers } from './sidebar/TopCarriers';
import { QuarantineLog } from './sidebar/QuarantineLog';
import { PoolStatus } from './sidebar/PoolStatus';
import { SelectedNodePanel } from './sidebar/SelectedNodePanel';
import { WelcomeModal } from './WelcomeModal';

/**
 * SpreadDashboard — top-level client component.
 *
 * Pulls data from useSpreadData (Supabase realtime + mock fallback).
 * Renders the infection tree with a clinical sidebar (70/30 desktop,
 * stacked on mobile).
 */
export function SpreadDashboard() {
  const { nodes, spreads, topCarriers, forfeitures, pool, feed, lastEvent, source } =
    useSpreadData();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  return (
    <>
      {source === 'mock' && (
        <div className="bg-accent-warning/15 border-b border-accent-warning/40 px-6 py-1.5 text-center font-mono text-[9px] uppercase tracking-wider text-accent-warning-deep">
          preview mode · live ledger not connected
        </div>
      )}

      {/* Desktop layout — 70/30 split, full viewport height */}
      <div className="hidden lg:grid grid-cols-[1fr_360px] h-[calc(100vh-89px)] overflow-hidden">
        <section className="relative border-r border-border-subtle overflow-hidden">
          <InfectionTree
            nodes={nodes}
            spreads={spreads}
            lastEvent={lastEvent}
            selectedWallet={selectedWallet}
            onSelectNode={setSelectedWallet}
          />
          <SelectedNodePanel
            selectedWallet={selectedWallet}
            nodes={nodes}
            spreads={spreads}
            onClose={() => setSelectedWallet(null)}
          />
        </section>
        <aside className="flex flex-col min-h-0 overflow-y-auto">
          <LiveFeed events={feed} />
          <TopCarriers
            carriers={topCarriers}
            onSelect={setSelectedWallet}
            selectedWallet={selectedWallet}
          />
          <QuarantineLog forfeitures={forfeitures} />
          <PoolStatus pool={pool} />
        </aside>
      </div>

      {/* Mobile layout — tree on top, sidebar stacked below */}
      <div className="lg:hidden flex flex-col">
        <section className="relative h-[60vh] border-b border-border-subtle overflow-hidden">
          <InfectionTree
            nodes={nodes}
            spreads={spreads}
            lastEvent={lastEvent}
            selectedWallet={selectedWallet}
            onSelectNode={setSelectedWallet}
          />
          <SelectedNodePanel
            selectedWallet={selectedWallet}
            nodes={nodes}
            spreads={spreads}
            onClose={() => setSelectedWallet(null)}
          />
        </section>
        <div>
          <PoolStatus pool={pool} />
          <LiveFeed events={feed} />
          <TopCarriers
            carriers={topCarriers}
            onSelect={setSelectedWallet}
            selectedWallet={selectedWallet}
          />
          <QuarantineLog forfeitures={forfeitures} />
        </div>
      </div>

      <WelcomeModal />
    </>
  );
}
