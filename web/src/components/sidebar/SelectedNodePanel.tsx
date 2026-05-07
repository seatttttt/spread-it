'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { WalletNode, SpreadEdge } from '../../types/spread';
import {
  truncateAddress,
  formatTokens,
  formatPct,
  formatSupplyPct,
  formatQuarantineRemaining,
} from '../../lib/format';

interface SelectedNodePanelProps {
  selectedWallet: string | null;
  nodes: WalletNode[];
  spreads: SpreadEdge[];
  onClose: () => void;
}

export function SelectedNodePanel({
  selectedWallet,
  nodes,
  spreads,
  onClose,
}: SelectedNodePanelProps) {
  const node = selectedWallet
    ? nodes.find((n) => n.wallet === selectedWallet)
    : null;

  const lineageIn = node
    ? spreads.filter((s) => s.recipient === node.wallet && s.valid)
    : [];
  const lineageOut = node
    ? spreads.filter((s) => s.sender === node.wallet && s.valid)
    : [];

  const drainPct =
    node && node.peakBalance > 0
      ? ((node.peakBalance - node.currentBalance) / node.peakBalance) * 100
      : 0;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className="absolute right-4 top-4 w-[300px] bg-bg-elevated border border-border-default p-4 shadow-[0_2px_16px_rgba(26,26,26,0.08)]"
        >
          <header className="flex items-start justify-between gap-2 pb-2 border-b border-border-subtle">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-widest text-text-tertiary">
                {node.status === 'patient_zero'
                  ? 'PATIENT ZERO'
                  : node.status === 'quarantined'
                    ? 'QUARANTINED'
                    : node.rScore > 0
                      ? 'ACTIVE CARRIER'
                      : 'DORMANT'}
              </div>
              <div className="font-mono text-[12px] text-text-primary mt-0.5 truncate">
                {truncateAddress(node.wallet, 8)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-lg leading-none"
              aria-label="Close panel"
            >
              ×
            </button>
          </header>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3 font-mono text-[11px]">
            <Row label="R-score" value={node.rScore.toString()} accent />
            <Row label="Spreads" value={node.spreadCount.toString()} />
            <Row label="Balance" value={formatTokens(node.currentBalance)} />
            <Row label="Peak" value={formatTokens(node.peakBalance)} />
            <Row label="Supply" value={formatSupplyPct(node.currentBalance)} />
            <Row
              label="Drain"
              value={formatPct(drainPct, 1)}
              critical={drainPct > 30}
            />
          </dl>

          {node.status === 'quarantined' && node.quarantineUntil && (
            <div className="mt-3 px-3 py-2 bg-accent-critical/10 border border-accent-critical/40 font-mono text-[10px] text-accent-critical uppercase tracking-wider">
              Quarantine ends in {formatQuarantineRemaining(node.quarantineUntil)}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border-subtle font-mono text-[10px] uppercase tracking-wider text-text-tertiary flex justify-between">
            <span>Infected by {lineageIn.length}</span>
            <span>Infected {lineageOut.length}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  label,
  value,
  accent,
  critical,
}: {
  label: string;
  value: string;
  accent?: boolean;
  critical?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd
        className={
          'tabular-nums text-[12px] mt-0.5 ' +
          (critical
            ? 'text-accent-critical'
            : accent
              ? 'text-accent-warning-deep font-semibold'
              : 'text-text-primary')
        }
      >
        {value}
      </dd>
    </div>
  );
}
