import { SpreadDashboard } from '../components/SpreadDashboard';
import { Logo } from '../components/Logo';

export default function HomePage() {
  return (
    <main className="min-h-screen w-full bg-bg-base text-text-primary">
      {/* Header */}
      <header className="border-b border-border-subtle bg-bg-elevated/85 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={36} className="text-accent-warning-deep flex-shrink-0" />
            <div className="leading-tight">
              <h1 className="font-display text-base tracking-wider text-text-primary uppercase font-semibold leading-none">
                Spread It
              </h1>
              <p className="font-mono text-[9px] uppercase tracking-widest text-text-tertiary mt-0.5">
                Strain Tracker · Live R-score reporting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden xl:inline font-mono text-[10px] uppercase tracking-wider text-text-secondary">
              spread to clean wallets · earn R · pool distributes live
            </span>
            <a
              href="/protocol"
              className="inline-flex items-center justify-center h-8 px-3 border border-border-default font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-colors duration-200 hover:text-accent-warning-deep hover:border-accent-warning-deep focus-visible:text-accent-warning-deep focus-visible:border-accent-warning-deep"
            >
              Protocol
            </a>
            <a
              href="https://x.com/spreadit_fun"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow on X — @spreadit_fun"
              className="flex items-center justify-center w-8 h-8 border border-border-default text-text-secondary transition-colors duration-200 hover:text-accent-warning-deep hover:border-accent-warning-deep focus-visible:text-accent-warning-deep focus-visible:border-accent-warning-deep"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <SpreadDashboard />
    </main>
  );
}
