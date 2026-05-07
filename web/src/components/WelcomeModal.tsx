'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * WelcomeModal — first-visit clinical briefing.
 *
 * Forces the user to read the protocol before interacting.
 * Dismissed via the "Acknowledge" button or Escape key.
 *
 * Persistence: localStorage flag, so returning visitors aren't re-shown.
 */

const STORAGE_KEY = 'spreadit:acknowledged';
const EASE = [0.16, 1, 0.3, 1] as const;

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => buttonRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-heading"
        >
          <div
            className="absolute inset-0 bg-bg-base/90 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            className="relative w-full max-w-[520px] bg-bg-elevated border border-border-default px-8 py-9 shadow-[0_2px_24px_rgba(26,26,26,0.08)]"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary mb-4 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-accent-warning" />
              <span>OUTBREAK NOTICE · STRAIN-001</span>
            </div>

            <h2
              id="welcome-heading"
              className="font-display text-3xl font-semibold text-text-primary tracking-tight"
            >
              Subject Briefing.
            </h2>

            <div className="mt-6 space-y-3.5 font-sans text-[13px] leading-relaxed text-text-primary/95">
              <p>
                <span className="font-mono uppercase tracking-wider text-accent-warning-deep">$SPREAD</span>{' '}
                is a transmission-rate experiment. Carriers spread the strain
                voluntarily. Creator fees pool and disburse live, weighted by
                R-share.
              </p>
              <ul className="space-y-2 list-none pl-0 font-mono text-[12px] text-text-secondary">
                <li>
                  <span className="text-text-primary">▸ CARRIER</span> — hold ≥
                  0.1% of supply.
                </li>
                <li>
                  <span className="text-text-primary">▸ SPREAD</span> — transfer
                  ≥ 0.01% to a clean wallet → +1 R per pair, ever.
                </li>
                <li>
                  <span className="text-text-primary">▸ HOST FILTER</span> —
                  recipient must hold ≥ 0.1 SOL · be ≥ 7 days old · have ≥ 3
                  outgoing tx.
                </li>
                <li>
                  <span className="text-accent-critical">▸ QUARANTINE</span> —
                  drain {'>'} 40% of peak holdings → R reset · 24h cooldown.
                </li>
              </ul>
              <p className="pt-1 text-text-secondary italic text-[12px]">
                Distribution begins on first credible spread.
              </p>
            </div>

            <button
              ref={buttonRef}
              type="button"
              onClick={dismiss}
              className="mt-8 w-full py-3 bg-accent-warning text-text-primary font-mono uppercase tracking-widest text-[11px] hover:bg-accent-warning-deep hover:text-bg-elevated transition-colors duration-200 focus-visible:bg-accent-warning-deep focus-visible:text-bg-elevated"
            >
              Acknowledge & Enter
            </button>

            <a
              href="/protocol"
              onClick={dismiss}
              className="mt-3 block text-center font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-accent-warning-deep focus-visible:text-accent-warning-deep transition-colors duration-200"
            >
              Read full protocol →
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
