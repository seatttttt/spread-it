'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { FeedEvent } from '../../types/spread';
import { truncateAddress, formatTimeMs, formatTokens } from '../../lib/format';

interface LiveFeedProps {
  events: FeedEvent[];
}

export function LiveFeed({ events }: LiveFeedProps) {
  return (
    <section
      aria-labelledby="live-feed-heading"
      className="border-b border-border-subtle bg-bg-elevated"
    >
      <header className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2
          id="live-feed-heading"
          className="font-mono uppercase tracking-widest text-[10px] text-text-secondary"
        >
          Live Feed
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-warning animate-pulse" />
          STREAMING
        </span>
      </header>
      <ul className="overflow-y-auto max-h-[280px] divide-y divide-border-subtle/60 font-mono text-[11px]">
        <AnimatePresence initial={false}>
          {events.slice(0, 30).map((event, idx) => (
            <motion.li
              key={feedKey(event, idx)}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="px-4 py-1.5 flex items-center gap-2"
            >
              <span className="text-text-tertiary tabular-nums">
                {formatTimeMs(event.at)}
              </span>
              <FeedRow event={event} />
            </motion.li>
          ))}
        </AnimatePresence>
        {events.length === 0 && (
          <li className="px-4 py-6 text-center text-text-tertiary italic">
            awaiting first event
          </li>
        )}
      </ul>
    </section>
  );
}

function feedKey(event: FeedEvent, idx: number): string {
  switch (event.type) {
    case 'spread':
      return `s-${event.data.signature}:${event.data.logIndex}`;
    case 'forfeiture':
      return `f-${event.data.id}`;
    case 'trade':
      return `t-${event.data.signature}-${idx}`;
  }
}

function FeedRow({ event }: { event: FeedEvent }) {
  if (event.type === 'spread') {
    const { sender, recipient, valid, amountTokens, rejectionReason } = event.data;
    return (
      <span className="flex-1 flex items-center gap-2 truncate">
        <span
          className={
            valid ? 'text-accent-warning-deep' : 'text-text-tertiary'
          }
        >
          {valid ? '+1 R' : 'REJECT'}
        </span>
        <span className="text-text-primary">{truncateAddress(sender)}</span>
        <span className="text-text-tertiary">→</span>
        <span className="text-text-primary">{truncateAddress(recipient)}</span>
        <span className="ml-auto text-text-tertiary">
          {valid ? `${formatTokens(amountTokens)}` : (rejectionReason ?? 'invalid')}
        </span>
      </span>
    );
  }
  if (event.type === 'forfeiture') {
    const { wallet, drainPct } = event.data;
    return (
      <span className="flex-1 flex items-center gap-2 truncate">
        <span className="text-accent-critical font-semibold">QUARANTINE</span>
        <span className="text-text-primary">{truncateAddress(wallet)}</span>
        <span className="ml-auto text-accent-critical tabular-nums">
          {drainPct.toFixed(1)}%
        </span>
      </span>
    );
  }
  // trade
  const { walletAddress, direction, solAmount } = event.data;
  return (
    <span className="flex-1 flex items-center gap-2 truncate">
      <span
        className={
          direction === 'buy' ? 'text-accent-active' : 'text-accent-critical'
        }
      >
        {direction.toUpperCase()}
      </span>
      <span className="text-text-primary">{truncateAddress(walletAddress)}</span>
      <span className="ml-auto text-text-tertiary tabular-nums">
        {solAmount.toFixed(3)} ◎
      </span>
    </span>
  );
}
