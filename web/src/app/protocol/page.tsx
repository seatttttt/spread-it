import Link from 'next/link';
import { Logo } from '../../components/Logo';

export const metadata = {
  title: 'Protocol · Spread It',
  description:
    'Mechanic specification, eligibility, spread cost, anti-sybil, R-score, drain forfeit, distribution.',
};

export default function ProtocolPage() {
  return (
    <main className="min-h-screen w-full bg-bg-base text-text-primary">
      {/* Header */}
      <header className="border-b border-border-subtle bg-bg-elevated/85 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size={36} className="text-accent-warning-deep flex-shrink-0" />
            <div className="leading-tight">
              <h1 className="font-display text-base tracking-wider text-text-primary uppercase font-semibold leading-none">
                Spread It
              </h1>
              <p className="font-mono text-[9px] uppercase tracking-widest text-text-tertiary mt-0.5">
                Strain Tracker · Protocol Specification
              </p>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-8 px-3 border border-border-default font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-colors duration-200 hover:text-accent-warning-deep hover:border-accent-warning-deep"
          >
            ← Back
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 prose-clinical">
        {/* Title block */}
        <div className="mb-12 pb-6 border-b border-border-subtle">
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent-warning" />
            <span>STRAIN-001 · PROTOCOL SPECIFICATION</span>
          </div>
          <h2 className="font-display text-4xl font-semibold tracking-tight leading-tight">
            $SPREAD
          </h2>
          <p className="mt-3 text-text-secondary text-base leading-relaxed">
            A pump.fun token with a transmission-rate mechanic. Carriers spread
            the strain to clean wallets and earn R-points. Creator fees pool
            and disburse live, weighted by R-share. Drain too much of your peak
            holdings and you are quarantined.
          </p>
        </div>

        <Section title="01 · Eligibility">
          <p>
            A wallet becomes an eligible <strong>carrier</strong> once it holds
            at least <Mono>0.1%</Mono> of total supply (1,000,000 tokens of a
            1B supply). The threshold is checked at the moment of every
            outbound transfer. Wallets below the threshold are tracked as{' '}
            <strong>dormant holders</strong>, visible in the orbital but
            unable to earn R.
          </p>
        </Section>

        <Section title="02 · Spread credit">
          <p>
            A spread is a wallet-to-wallet transfer of at least{' '}
            <Mono>0.01%</Mono> of supply (100,000 tokens). For each valid
            spread, the sender earns <strong>+1 R</strong>. R is linear with no
            cap.
          </p>
          <p>
            The credit is granted exactly once per{' '}
            <Mono>(sender, recipient)</Mono> pair, ever. Re-spreading to the
            same wallet does not earn additional R, those transfers count as{' '}
            <em>drain</em> instead.
          </p>
        </Section>

        <Section title="03 · Host filter (anti-sybil)">
          <p>
            For a spread to be credited, the recipient must pass three on-chain
            checks at the time of transfer:
          </p>
          <ul className="space-y-1.5 mt-2 font-mono text-[13px] text-text-secondary">
            <li>
              <span className="text-text-primary">▸ SOL balance</span> ≥ 0.1 SOL
            </li>
            <li>
              <span className="text-text-primary">▸ Account age</span> ≥ 7 days
              (first observed transaction)
            </li>
            <li>
              <span className="text-text-primary">▸ Outgoing transactions</span>{' '}
              ≥ 3
            </li>
          </ul>
          <p className="mt-3">
            A failing recipient does not block the transfer on-chain, but the
            sender forfeits R for that transfer, and the outflow counts as
            drain toward forfeit.
          </p>
        </Section>

        <Section title="04 · Quarantine (drain forfeit)">
          <p>
            A wallet is quarantined when its cumulative <em>drain</em> exceeds{' '}
            <Mono>40%</Mono> of its peak holdings.
          </p>
          <p>
            <strong>Drain</strong> = all outflows that are not credited
            spreads. Sells on the bonding curve, sells on PumpSwap, transfers
            to wallets that fail the host filter, repeat transfers to
            already-credited recipients, all count as drain. Spread-credited
            outflows are excluded.
          </p>
          <p>
            On forfeit:
          </p>
          <ul className="space-y-1.5 mt-2 font-mono text-[13px] text-text-secondary">
            <li>
              <span className="text-text-primary">▸ R-score</span> reset to 0
            </li>
            <li>
              <span className="text-accent-critical">▸ Status</span>{' '}
              QUARANTINED for 24 hours
            </li>
            <li>
              <span className="text-text-primary">▸ After 24h</span> status
              returns to ACTIVE, R-score remains 0
            </li>
          </ul>
          <p className="mt-3">
            A quarantined wallet can return to carrier eligibility (R must be
            re-earned from scratch) but its forfeiture is permanently logged.
          </p>
        </Section>

        <Section title="05 · Distribution">
          <p>
            On every trade, pump.fun mints a creator fee accruing to the dev
            wallet (Patient Zero). The bot collects vault balances every 10
            seconds and distributes to carriers, pro-rata, weighted by
            R-share.
          </p>
          <p>
            For a trade with fee <Mono>F</Mono> SOL, an active carrier with{' '}
            <Mono>R_w</Mono> R-points receives:
          </p>
          <pre className="mt-2 mb-2 px-4 py-3 bg-bg-surface border border-border-subtle font-mono text-[12px] text-text-primary overflow-x-auto">
            {`payout_w  =  F  ×  ( R_w / Σ R_active )`}
          </pre>
          <p>
            Until the first valid spread occurs, fees pool in the dev wallet
            (no eligible carriers exist). After that, every trade triggers a
            live distribution.
          </p>
        </Section>

        <Section title="06 · Patient Zero">
          <p>
            The dev wallet is designated <strong>Patient Zero</strong>. It
            holds an R-floor of 10 (ornamental, used for visualization only)
            and is <strong>excluded from distribution</strong>.
          </p>
          <p>
            Patient Zero cannot earn R from its own spreads (no double-dip).
            The dev's only economic exposure is the pre-launch token bag,
            same as any other holder.
          </p>
        </Section>

        <Section title="07 · Trust model">
          <p>
            All on-chain activity is publicly verifiable. The distribution
            wallet address, every spread, every forfeiture, and every payout
            tx-signature are exposed in the dashboard and queryable on-chain.
          </p>
          <p>
            The bot uses the Supabase service-role key to write state; the
            frontend uses the anon key with read-only RLS. No user input
            mediates carrier eligibility, the bot reads on-chain truth.
          </p>
        </Section>

        <div className="mt-16 pt-6 border-t border-border-subtle font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
          <p>
            END OF SPECIFICATION ·{' '}
            <Link
              href="/"
              className="text-accent-warning-deep hover:text-text-primary transition-colors"
            >
              Return to tracker →
            </Link>
          </p>
        </div>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-accent-warning-deep mb-3">
        {title}
      </h3>
      <div className="space-y-3 text-[14px] leading-relaxed text-text-primary/95">
        {children}
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[13px] text-accent-warning-deep">
      {children}
    </code>
  );
}
