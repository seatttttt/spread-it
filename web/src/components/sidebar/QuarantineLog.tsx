'use client';

import type { ForfeitureRecord } from '../../types/spread';
import {
  truncateAddress,
  formatTimeAgo,
  formatPct,
  formatQuarantineRemaining,
} from '../../lib/format';

interface QuarantineLogProps {
  forfeitures: ForfeitureRecord[];
}

export function QuarantineLog({ forfeitures }: QuarantineLogProps) {
  const recent = forfeitures.slice(0, 8);
  return (
    <section
      aria-labelledby="quarantine-log-heading"
      className="border-b border-border-subtle bg-bg-elevated"
    >
      <header className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2
          id="quarantine-log-heading"
          className="font-mono uppercase tracking-widest text-[10px] text-text-secondary"
        >
          Quarantine Log
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-accent-critical">
          {recent.length} CASES
        </span>
      </header>
      <ul className="font-mono text-[11px] divide-y divide-border-subtle/60">
        {recent.map((f) => (
          <li key={f.id} className="px-4 py-2 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-accent-critical">▼</span>
              <span className="text-text-primary truncate">
                {truncateAddress(f.wallet)}
              </span>
              <span className="ml-auto text-text-tertiary tabular-nums">
                {formatTimeAgo(f.occurredAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-text-secondary">
              <span>R {f.rAtForfeit} → 0</span>
              <span>·</span>
              <span className="text-accent-critical">{formatPct(f.drainPct, 1)} drain</span>
              <span className="ml-auto">
                {formatQuarantineRemaining(f.quarantineUntil)} left
              </span>
            </div>
          </li>
        ))}
        {recent.length === 0 && (
          <li className="px-4 py-6 text-center text-text-tertiary italic">
            no quarantines yet
          </li>
        )}
      </ul>
    </section>
  );
}
