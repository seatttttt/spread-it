/**
 * Motion primitives — single source of truth for easings + durations.
 * Match the `lux` token in tailwind.config.ts.
 */

import { useReducedMotion as fmUseReducedMotion } from 'framer-motion';

/** Linear-style smooth easing — used everywhere we want a "premium fade". */
export const LUX_EASE = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  fast: 0.2,
  base: 0.4,
  slow: 0.85,
} as const;

/** Re-export for ergonomic imports. */
export const useReducedMotion = fmUseReducedMotion;
