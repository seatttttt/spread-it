# Spread It · $SPREAD

A pump.fun memecoin tek mechanic. Carriers spread the token to clean wallets and earn R-points. Creator fees are pooled and distributed live, weighted by R-share. Drain too much of your peak holdings and you're quarantined.

## Mechanic

- Hold ≥ 0.1% of supply → eligible carrier
- Transfer ≥ 0.01% of supply to a clean wallet → +1 R per (sender, recipient) pair
- Anti-sybil: recipient must hold ≥ 0.1 SOL, be ≥ 7 days old, and have ≥ 3 outgoing tx
- One R per pair, ever (no farming the same wallet twice)
- Drain > 40% of peak holdings (excluding spread costs) → R reset to 0 + 24h QUARANTINE
- After 24h, status returns to ACTIVE with R=0
- Patient Zero (dev wallet): R=10 floor, ornamental, excluded from distribution
- Distribution: per-trade live, weighted by R-share. Fees pool until first non-PZ spread.

## Stack

| Layer | Tech |
|---|---|
| Bot | Node.js + TypeScript + Express + `@nirholas/pump-sdk` + `@solana/web3.js` |
| DB | Supabase (Postgres + RLS + realtime) |
| Frontend | Next.js 14 App Router + Tailwind + framer-motion + react-force-graph-2d |
| Infra | Helius webhooks (SWAP + TRANSFER), Vercel, Railway |

## Repository layout

```
bot/                Node bot — claim loop, webhook parser, R-score engine, distribution
web/                Next.js frontend — infection tree + clinical lab dashboard
supabase/           SQL migrations
keypairs/           Local secrets (gitignored)
```

## Local dev

```bash
# Bot
cd bot && pnpm install && cp ../.env.example .env && pnpm dev   # → :3001/health

# Web
cd web && pnpm install && cp .env.local.example .env.local && pnpm dev   # → :3000
```

The frontend works standalone with mock data when Supabase env vars are missing.

## Production

See [LAUNCH.md](./LAUNCH.md) for the full launch checklist.

## Trust model

- Bot uses Supabase **service-role** key → bypasses RLS, full write access
- Frontend uses **anon** key with read-only RLS policies
- Distribution wallet private key lives only in bot env (never committed, never browser)
- All on-chain activity is publicly verifiable via the distribution wallet address
