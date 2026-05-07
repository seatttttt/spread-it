import type { Config } from 'tailwindcss';

/**
 * Design DNA: Clinical Lab — CDC outbreak dashboard.
 *
 * Reference compass: WHO website × Johns Hopkins COVID tracker × CDC dashboards
 * × scientific paper layouts.
 * Light mode. Biohazard yellow accent. Clinical, detached, data-rich.
 */
export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds — warm off-white, not stark white
        'bg-base': '#fafaf7',
        'bg-surface': '#f0f0eb',
        'bg-elevated': '#ffffff',
        // Text
        'text-primary': '#1a1a1a',
        'text-secondary': '#6b6b66',
        'text-tertiary': '#a3a399',
        // Borders
        'border-subtle': '#d4d4d0',
        'border-default': '#b8b8b0',
        // Accents
        'accent-warning': '#facc15', // biohazard yellow — primary accent
        'accent-warning-deep': '#ca8a04',
        'accent-critical': '#dc2626', // forfeit / quarantine red
        'accent-data': '#1e40af', // chart blue
        'accent-active': '#16a34a', // active carrier (rare, for "spread successful" pulse)
        // Status mapping
        'status-active': '#facc15',
        'status-quarantined': '#dc2626',
        'status-dormant': '#a3a399',
        'status-patient-zero': '#ca8a04',
      },
      fontFamily: {
        // Display + body — clean sans-serif (Söhne / Inter)
        sans: [
          '"Söhne"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        display: [
          '"Söhne"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        // Data / addresses / readings: JetBrains Mono / IBM Plex Mono
        mono: [
          '"JetBrains Mono"',
          '"IBM Plex Mono"',
          '"Berkeley Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      transitionTimingFunction: {
        // Smooth easing for clinical feel
        clinical: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      letterSpacing: {
        wider: '0.08em',
        widest: '0.18em',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'biohazard-spin': 'spin 8s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
