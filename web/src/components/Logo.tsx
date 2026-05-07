/**
 * Logo — $SPREAD biohazard-inspired emblem.
 *
 * Pure SVG, transparent background, scalable.
 * Three rings around a central pulse — the trefoil silhouette
 * reads as "biohazard" without literally copying the WHO symbol.
 *
 * Color is `currentColor`-driven so it inherits from the Tailwind
 * `text-*` class on the parent (use `text-accent-warning` for the
 * biohazard yellow).
 */

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 48, className = '' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Spread It"
      className={className}
    >
      <defs>
        <radialGradient id="spread-pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.65" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer ring — chamber boundary */}
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.35"
      />

      {/* Three trefoil lobes (biohazard-inspired) */}
      <g>
        {/* Top */}
        <circle
          cx="100"
          cy="46"
          r="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
        />
        {/* Bottom-left */}
        <circle
          cx="53"
          cy="127"
          r="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
        />
        {/* Bottom-right */}
        <circle
          cx="147"
          cy="127"
          r="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
        />
      </g>

      {/* Inner center hub */}
      <circle cx="100" cy="100" r="22" fill="url(#spread-pulse)" />
      <circle cx="100" cy="100" r="9" fill="currentColor" />

      {/* Connector edges from center to each lobe */}
      <g stroke="currentColor" strokeWidth="2" opacity="0.55">
        <line x1="100" y1="100" x2="100" y2="46" />
        <line x1="100" y1="100" x2="53" y2="127" />
        <line x1="100" y1="100" x2="147" y2="127" />
      </g>
    </svg>
  );
}
