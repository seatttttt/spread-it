# Launch playbook — $SPREAD

Everything is wired and idling in **standby mode**. The bot is alive, the
DB is migrated, the frontend is deployed. To go live, you only need to
plug in three values + one DNS update.

## Status overview

| Layer | URL / Resource | State |
|---|---|---|
| GitHub repo | https://github.com/seatttttt/spread-it | public, main branch |
| Supabase | https://lvtijoqumkgsigocsbjw.supabase.co | active, 9 tables + 5 views, RLS + realtime |
| Bot (Railway) | https://spread-it-bot-production.up.railway.app | running, status=`standby` |
| Frontend (Vercel) | https://spread-it-one.vercel.app | live, mock-data fallback |
| Helius webhook | id `738d3d34-7708-4d6a-a139-2ef99fbcf5b0` | active, placeholder mint |
| Domain | spreadit.fun (Namecheap) | not purchased yet |

## What you need to provide

| Input | Where it goes | Why |
|---|---|---|
| **CA** (token mint address) | Railway env `TOKEN_MINT`, Helius webhook `accountAddresses`, Vercel env `NEXT_PUBLIC_TOKEN_MINT` | Bot listens, frontend shows ticker |
| **Dev wallet private key** (base58) | Railway env `DISTRIBUTION_WALLET_PRIVATE_KEY` | Signs distributions + claim tx |
| **Dev wallet public key** | Railway env `DISTRIBUTION_WALLET_PUBLIC_KEY` | Patient Zero anchor |
| **DNS** (CNAME) | Namecheap → Vercel + Railway | Custom domains |

That's it. No code changes needed.

---

## Launch sequence (≈ 10 minutes)

### 1. Mint $SPREAD on pump.fun

1. Upload `web/public/token.png` as the token image
2. Token name: **Spread It**, ticker: **$SPREAD**
3. Buy ~5.11% of supply (Patient Zero bag)
4. Capture the **mint address** (the CA)

### 2. Set Railway env vars

```bash
cd /Users/bassamchaouki/pvetek/bot
railway variables \
  --set "TOKEN_MINT=<paste CA here>" \
  --set "DISTRIBUTION_WALLET_PRIVATE_KEY=<paste base58 private key>" \
  --set "DISTRIBUTION_WALLET_PUBLIC_KEY=<paste public key>"
```

Railway auto-redeploys. Verify in ~30s:

```bash
curl -s https://spread-it-bot-production.up.railway.app/health | jq
# → status: "ok", walletConfigured: true, tokenMint: "<your CA>"
```

The boot sequence will:
- Bootstrap Patient Zero (R=10 floor) in `wallet_scores`
- Start the claim loop (collects creator fees every 10s)
- Listen for webhook events

### 3. Update Helius webhook

```bash
HELIUS_KEY=$(cat /Users/bassamchaouki/pvetek/keypairs/helius_api_key.txt)
WEBHOOK_SECRET=$(cat /Users/bassamchaouki/pvetek/keypairs/spreadit_helius_webhook_secret.txt)
WEBHOOK_ID="738d3d34-7708-4d6a-a139-2ef99fbcf5b0"
CA="<paste your CA>"

curl -X PUT -H "Content-Type: application/json" \
  "https://api.helius.xyz/v0/webhooks/$WEBHOOK_ID?api-key=$HELIUS_KEY" \
  -d "{
    \"webhookURL\": \"https://spread-it-bot-production.up.railway.app/webhook/helius\",
    \"transactionTypes\": [\"SWAP\", \"TRANSFER\"],
    \"webhookType\": \"enhanced\",
    \"authHeader\": \"$WEBHOOK_SECRET\",
    \"accountAddresses\": [\"$CA\"]
  }"
```

Webhook now fires on every SWAP and TRANSFER touching your mint.

### 4. Set Vercel env var (for the ticker on the frontend)

```bash
cd /Users/bassamchaouki/pvetek/web
echo "<paste your CA>" | vercel env add NEXT_PUBLIC_TOKEN_MINT production
vercel --prod --yes  # redeploy to pick up the new env
```

### 5. Custom domain (when you've bought spreadit.fun)

#### a. In Namecheap
- Add `A` record: `@` → `76.76.21.21` (Vercel)
- Add `CNAME` record: `www` → `cname.vercel-dns.com`

#### b. In Vercel
```bash
cd /Users/bassamchaouki/pvetek/web
vercel domains add spreadit.fun
vercel domains add www.spreadit.fun
# Vercel auto-detects DNS records; SSL provisions in ~30s
```

(Optional: also point `bot.spreadit.fun` → Railway via CNAME to
`spread-it-bot-production.up.railway.app`.)

### 6. Post-launch verification

```bash
# Bot is ingesting events
curl -s https://spread-it-bot-production.up.railway.app/health | jq '.status'   # → "ok"

# Frontend has DB data
curl -s "https://lvtijoqumkgsigocsbjw.supabase.co/rest/v1/wallet_scores?select=*&apikey=$(cat /Users/bassamchaouki/pvetek/keypairs/spreadit_supabase_anon_key.txt)" | jq '.[0]'
# → first row should be your dev wallet with status=patient_zero, r_score=10

# Real trades flowing in
# Watch the live feed at https://spread-it-one.vercel.app — first SWAP should appear within seconds of any pump.fun trade.
```

---

## Saved keys (in `keypairs/`, gitignored)

| File | Contents |
|---|---|
| `spreadit_supabase_url.txt` | https://lvtijoqumkgsigocsbjw.supabase.co |
| `spreadit_supabase_anon_key.txt` | Frontend public key |
| `spreadit_supabase_service_role.txt` | Bot bypasses-RLS key |
| `spreadit_supabase_project_ref.txt` | `lvtijoqumkgsigocsbjw` |
| `spreadit_helius_webhook_secret.txt` | Bot validates webhook auth header |
| `spreadit_helius_webhook_id.txt` | For `PUT` updates |
| `spreadit_railway_url.txt` | Bot URL |
| `spreadit_vercel_url.txt` | Frontend URL |
| `spreadit_github_url.txt` | Repo URL |
| `helius_api_key.txt` | (existing — reused) |

---

## Things to check before the final go

- [ ] Dev wallet has ≥ 0.5 SOL (gas for distribution txs over the first hour)
- [ ] `web/public/token.png` looks right at small size (pump.fun thumbnails are tiny)
- [ ] Twitter handle `@spreadit_fun` reserved (page.tsx links to it)
- [ ] X bio + pinned tweet drafted

## Rollback

If something goes very wrong, the old THE SEAT infra is untouched:
- `seatttttt/the-seat` repo still on GitHub
- `theseat.fun` Vercel project still linked
- `the-seat-bot` Railway project still around
- THE SEAT Supabase project (`isaaqxvxbbwrbtjsbtab`) still around

Nothing here cross-contaminates the previous attempt.
