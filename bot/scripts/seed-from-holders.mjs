/**
 * One-shot seed: snapshot current top holders into wallet_peaks (for the
 * orbital visualization on the frontend).
 *
 * NOT required at launch (cold-start design) — but can be run any time to
 * backfill the orbital with current on-chain holders. Excludes the dev
 * wallet (Patient Zero, already seeded) and any "holder" with > 50% of
 * supply (system accounts: bonding curve, pool, etc.).
 *
 * Run: node bot/scripts/seed-from-holders.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url) });

const TOKEN_MINT = process.env.TOKEN_MINT;
const HELIUS_KEY = process.env.HELIUS_API_KEY;
const DEV_WALLET = process.env.DISTRIBUTION_WALLET_PUBLIC_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN_MINT || !HELIUS_KEY || !DEV_WALLET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing required env vars. Set .env with TOKEN_MINT, HELIUS_API_KEY, DISTRIBUTION_WALLET_PUBLIC_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const TOTAL_SUPPLY_ATOMIC = 10n ** 15n; // 1B tokens × 10^6 decimals
// Skip "holders" that own > 50% of supply (these are system accounts)
const SYSTEM_ACCOUNT_THRESHOLD = TOTAL_SUPPLY_ATOMIC / 2n;

// 1. Fetch all token accounts via Helius.
async function fetchHolders() {
  const res = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getTokenAccounts',
        params: { mint: TOKEN_MINT, limit: 1000 },
      }),
    },
  );
  const json = await res.json();
  return json.result?.token_accounts ?? [];
}

// 2. Aggregate per owner, filter system accounts + dev wallet.
function aggregate(accounts) {
  const byOwner = new Map();
  for (const a of accounts) {
    const balance = BigInt(a.amount ?? '0');
    if (balance === 0n) continue;
    if (balance > SYSTEM_ACCOUNT_THRESHOLD) continue;
    if (a.owner === DEV_WALLET) continue;
    byOwner.set(a.owner, (byOwner.get(a.owner) ?? 0n) + balance);
  }
  return [...byOwner.entries()]
    .map(([owner, bal]) => ({ owner, balance: bal }))
    .sort((x, y) => (y.balance > x.balance ? 1 : -1));
}

async function main() {
  console.log('Fetching token holders…');
  const accounts = await fetchHolders();
  console.log(`Got ${accounts.length} token accounts.`);

  const ranked = aggregate(accounts);
  console.log(
    `${ranked.length} eligible holders after excluding system accounts + dev wallet.`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. Upsert wallet_peaks for ALL eligible holders.
  // current_balance = peak_balance (since we don't know history).
  // total_drain = 0, total_spread_outflow = 0 (clean slate).
  console.log('Upserting wallet_peaks…');
  const DECIMALS = 6n;
  const SCALE = 10n ** DECIMALS;
  const peakRows = ranked.map((r) => {
    const tokenUnits = Number(r.balance) / Number(SCALE);
    return {
      wallet: r.owner,
      current_balance: tokenUnits.toString(),
      peak_balance: tokenUnits.toString(),
      last_updated: new Date().toISOString(),
    };
  });
  const { error: peakErr } = await supabase
    .from('wallet_peaks')
    .upsert(peakRows);
  if (peakErr) {
    console.error('wallet_peaks upsert failed:', peakErr);
    process.exit(1);
  }
  console.log(`  ${peakRows.length} rows upserted.`);

  console.log('\nDone. Frontend should reflect orbital nodes via Supabase realtime.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
