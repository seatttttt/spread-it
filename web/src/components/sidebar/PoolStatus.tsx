'use client';

import type { PoolStatus as PoolStatusType } from '../../types/spread';
import { formatSol, formatTimeAgo } from '../../lib/format';

interface PoolStatusProps {
  pool: PoolStatusType;
}

export function PoolStatus({ pool }: PoolStatusProps) {
  return (
    <section
      aria-labelledby="pool-status-heading"
      className="bg-bg-elevated"
    >
      <header className="px-4 pt-3 pb-2">
        <h2
          id="pool-status-heading"
          className="font-mono uppercase tracking-widest text-[10px] text-text-secondary"
        >
          Pool Status
        </h2>
      </header>
      <dl className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px]">
        <Stat label="Active carriers" value={pool.activeCarriers.toString()} />
        <Stat label="Total R" value={pool.totalR.toLocaleString()} />
        <Stat label="Spreads (valid)" value={pool.totalSpreads.toLocaleString()} />
        <Stat
          label="Quarantines (24h)"
          value={pool.forfeitures24h.toString()}
          critical={pool.forfeitures24h > 0}
        />
        <Stat
          label="Distributed"
          value={`${formatSol(pool.totalDistributedSol, 3)} ◎`}
          accent
        />
        <Stat
          label="Last trade"
          value={pool.lastTradeAt ? formatTimeAgo(pool.lastTradeAt) : '-'}
        />
      </dl>
    </section>
  );
}

function Stat({
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
          'tabular-nums text-[13px] mt-0.5 ' +
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
