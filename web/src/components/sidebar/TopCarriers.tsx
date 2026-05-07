'use client';

import type { TopCarrier } from '../../types/spread';
import { truncateAddress, formatPct } from '../../lib/format';

interface TopCarriersProps {
  carriers: TopCarrier[];
  onSelect?: (wallet: string | null) => void;
  selectedWallet?: string | null;
}

export function TopCarriers({ carriers, onSelect, selectedWallet }: TopCarriersProps) {
  const top = carriers.slice(0, 10);
  return (
    <section
      aria-labelledby="top-carriers-heading"
      className="border-b border-border-subtle bg-bg-elevated"
    >
      <header className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2
          id="top-carriers-heading"
          className="font-mono uppercase tracking-widest text-[10px] text-text-secondary"
        >
          Top Carriers
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary">
          R-SCORE
        </span>
      </header>
      <ol className="font-mono text-[11px] divide-y divide-border-subtle/60">
        {top.map((c, i) => (
          <li
            key={c.wallet}
            className={
              'px-4 py-1.5 flex items-center gap-2 cursor-pointer transition-colors duration-150 ' +
              (selectedWallet === c.wallet
                ? 'bg-accent-warning/15'
                : 'hover:bg-bg-surface/60')
            }
            onClick={() =>
              onSelect && onSelect(c.wallet === selectedWallet ? null : c.wallet)
            }
          >
            <span className="text-text-tertiary tabular-nums w-5">
              {(i + 1).toString().padStart(2, '0')}
            </span>
            <span className="text-text-primary truncate">
              {truncateAddress(c.wallet, 5)}
            </span>
            <span className="ml-auto flex items-center gap-2.5">
              <span
                className="text-accent-warning-deep tabular-nums font-semibold"
                title="R-score"
              >
                {c.rScore}
              </span>
              <span
                className={
                  'text-[10px] tabular-nums ' +
                  (c.drainPct > 30 ? 'text-accent-critical' : 'text-text-tertiary')
                }
                title="drain pct"
              >
                {formatPct(c.drainPct, 0)}
              </span>
            </span>
          </li>
        ))}
        {top.length === 0 && (
          <li className="px-4 py-6 text-center text-text-tertiary italic">
            no carriers yet
          </li>
        )}
      </ol>
    </section>
  );
}
