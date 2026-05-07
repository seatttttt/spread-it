-- =====================================================================
-- $SPREAD — initial schema
-- See README.md for the mechanic spec.
-- =====================================================================

-- =====================================================================
-- 1. config — single row of runtime configuration
-- =====================================================================
CREATE TABLE IF NOT EXISTS config (
  id                       INT PRIMARY KEY DEFAULT 1,
  token_mint               TEXT,
  token_decimals           INT NOT NULL DEFAULT 6,
  total_supply             NUMERIC NOT NULL DEFAULT 1000000000,
  carrier_min_pct          NUMERIC NOT NULL DEFAULT 0.1,
  spread_min_pct           NUMERIC NOT NULL DEFAULT 0.01,
  forfeit_drain_pct        NUMERIC NOT NULL DEFAULT 40,
  quarantine_hours         INT NOT NULL DEFAULT 24,
  patient_zero_wallet      TEXT,
  patient_zero_r_floor     INT NOT NULL DEFAULT 10,
  recipient_min_sol        NUMERIC NOT NULL DEFAULT 0.1,
  recipient_min_age_days   INT NOT NULL DEFAULT 7,
  recipient_min_outgoing   INT NOT NULL DEFAULT 3,
  launch_completed_at      TIMESTAMPTZ,
  graduated_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);

INSERT INTO config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. wallet_scores — every wallet that ever earned R or was tracked
-- Wallets without a row default to: r_score=0, status='active'
-- =====================================================================
CREATE TABLE IF NOT EXISTS wallet_scores (
  wallet              TEXT PRIMARY KEY,
  r_score             INT NOT NULL DEFAULT 0,
  spread_count        INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'quarantined', 'patient_zero')),
  quarantine_until    TIMESTAMPTZ,
  first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_scores_r_idx
  ON wallet_scores (r_score DESC) WHERE r_score > 0;
CREATE INDEX IF NOT EXISTS wallet_scores_quarantine_idx
  ON wallet_scores (quarantine_until) WHERE status = 'quarantined';
CREATE INDEX IF NOT EXISTS wallet_scores_status_idx
  ON wallet_scores (status);

-- =====================================================================
-- 3. wallet_peaks — peak balance + drain tracking per wallet
-- =====================================================================
CREATE TABLE IF NOT EXISTS wallet_peaks (
  wallet                  TEXT PRIMARY KEY,
  current_balance         NUMERIC NOT NULL DEFAULT 0,
  peak_balance            NUMERIC NOT NULL DEFAULT 0,
  total_drain             NUMERIC NOT NULL DEFAULT 0,
  total_spread_outflow    NUMERIC NOT NULL DEFAULT 0,
  last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_peaks_balance_idx
  ON wallet_peaks (current_balance DESC);

-- =====================================================================
-- 4. wallet_metadata — anti-sybil cache (Helius RPC results)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wallet_metadata (
  wallet              TEXT PRIMARY KEY,
  first_tx_at         TIMESTAMPTZ,
  outgoing_tx_count   INT NOT NULL DEFAULT 0,
  sol_balance_lamports NUMERIC NOT NULL DEFAULT 0,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 5. trades — DEX swap events (pump.fun bonding curve + PumpSwap)
-- =====================================================================
CREATE TABLE IF NOT EXISTS trades (
  signature           TEXT PRIMARY KEY,
  slot                BIGINT NOT NULL,
  on_chain_at         TIMESTAMPTZ,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction           TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  wallet_address      TEXT NOT NULL,
  sol_amount          NUMERIC NOT NULL,
  token_amount        NUMERIC NOT NULL,
  fee_amount_sol      NUMERIC NOT NULL,
  venue               TEXT NOT NULL CHECK (venue IN ('bonding_curve', 'pumpswap')),
  distributed         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS trades_observed_at_idx ON trades (observed_at DESC);
CREATE INDEX IF NOT EXISTS trades_pending_idx ON trades (observed_at) WHERE NOT distributed;

-- =====================================================================
-- 6. spreads — wallet-to-wallet token transfer events (the infections)
-- valid=true → counted as a spread (+1 R)
-- valid=false → recorded for analytics/audit, with rejection_reason
-- =====================================================================
CREATE TABLE IF NOT EXISTS spreads (
  signature           TEXT NOT NULL,
  log_index           INT NOT NULL DEFAULT 0,
  slot                BIGINT NOT NULL,
  on_chain_at         TIMESTAMPTZ,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sender              TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  amount_tokens       NUMERIC NOT NULL,
  valid               BOOLEAN NOT NULL,
  rejection_reason    TEXT,
  PRIMARY KEY (signature, log_index)
);

CREATE INDEX IF NOT EXISTS spreads_observed_at_idx ON spreads (observed_at DESC);
CREATE INDEX IF NOT EXISTS spreads_sender_idx ON spreads (sender, observed_at DESC);
CREATE INDEX IF NOT EXISTS spreads_recipient_idx ON spreads (recipient, observed_at DESC);
CREATE INDEX IF NOT EXISTS spreads_valid_idx ON spreads (valid, observed_at DESC);
-- One valid spread per (sender, recipient) pair, ever.
CREATE UNIQUE INDEX IF NOT EXISTS spreads_pair_unique
  ON spreads (sender, recipient) WHERE valid = TRUE;

-- =====================================================================
-- 7. forfeitures — quarantine events (R reset + 24h cooldown)
-- =====================================================================
CREATE TABLE IF NOT EXISTS forfeitures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet              TEXT NOT NULL,
  r_at_forfeit        INT NOT NULL,
  peak_at_forfeit     NUMERIC NOT NULL,
  drain_at_forfeit    NUMERIC NOT NULL,
  drain_pct           NUMERIC NOT NULL,
  trigger_signature   TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quarantine_until    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS forfeitures_occurred_at_idx
  ON forfeitures (occurred_at DESC);
CREATE INDEX IF NOT EXISTS forfeitures_wallet_idx
  ON forfeitures (wallet, occurred_at DESC);

-- =====================================================================
-- 8. distributions — one row per (trade × recipient_wallet) payout
-- R-weighted, so amount_sol varies per recipient.
-- =====================================================================
CREATE TABLE IF NOT EXISTS distributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_signature     TEXT NOT NULL REFERENCES trades(signature),
  recipient_wallet    TEXT NOT NULL,
  r_share             INT NOT NULL,
  total_r             INT NOT NULL,
  amount_sol          NUMERIC NOT NULL,
  tx_signature        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'confirmed', 'failed')),
  attempts            INT NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ,
  UNIQUE (trade_signature, recipient_wallet)
);

CREATE INDEX IF NOT EXISTS distributions_created_at_idx
  ON distributions (created_at DESC);
CREATE INDEX IF NOT EXISTS distributions_status_idx
  ON distributions (status) WHERE status IN ('pending', 'sent', 'failed');
CREATE INDEX IF NOT EXISTS distributions_recipient_idx
  ON distributions (recipient_wallet, created_at DESC);

-- =====================================================================
-- 9. webhook_events — raw audit log of inbound webhook payloads
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,
  event_type    TEXT,
  raw_payload   JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx
  ON webhook_events (received_at) WHERE NOT processed;

-- =====================================================================
-- HELPER FUNCTIONS — atomic mutations called by the bot
-- =====================================================================

-- Credit a sender +1 R after a valid spread.
-- Caller must have validated eligibility + anti-sybil.
CREATE OR REPLACE FUNCTION credit_r(p_wallet TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO wallet_scores (wallet, r_score, spread_count, status, last_updated)
    VALUES (p_wallet, 1, 1, 'active', NOW())
  ON CONFLICT (wallet) DO UPDATE
    SET r_score = wallet_scores.r_score + 1,
        spread_count = wallet_scores.spread_count + 1,
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Forfeit a wallet — reset R, set quarantine, log.
CREATE OR REPLACE FUNCTION forfeit_wallet(
  p_wallet            TEXT,
  p_trigger_signature TEXT,
  p_quarantine_hours  INT DEFAULT 24
) RETURNS VOID AS $$
DECLARE
  v_r              INT;
  v_peak           NUMERIC;
  v_drain          NUMERIC;
  v_quarantine_until TIMESTAMPTZ;
BEGIN
  v_quarantine_until := NOW() + (p_quarantine_hours || ' hours')::INTERVAL;

  SELECT r_score INTO v_r FROM wallet_scores WHERE wallet = p_wallet;
  SELECT peak_balance, total_drain INTO v_peak, v_drain
    FROM wallet_peaks WHERE wallet = p_wallet;

  v_r     := COALESCE(v_r, 0);
  v_peak  := COALESCE(v_peak, 0);
  v_drain := COALESCE(v_drain, 0);

  -- Patient Zero is immune
  IF EXISTS (
    SELECT 1 FROM wallet_scores WHERE wallet = p_wallet AND status = 'patient_zero'
  ) THEN
    RETURN;
  END IF;

  UPDATE wallet_scores
     SET r_score = 0,
         status = 'quarantined',
         quarantine_until = v_quarantine_until,
         last_updated = NOW()
   WHERE wallet = p_wallet;

  INSERT INTO forfeitures (
    wallet, r_at_forfeit, peak_at_forfeit, drain_at_forfeit,
    drain_pct, trigger_signature, quarantine_until
  ) VALUES (
    p_wallet, v_r, v_peak, v_drain,
    CASE WHEN v_peak > 0 THEN (v_drain / v_peak) * 100 ELSE 0 END,
    p_trigger_signature, v_quarantine_until
  );
END;
$$ LANGUAGE plpgsql;

-- Update a wallet's balance (delta-style). Re-evaluates peak.
-- positive p_delta = inflow; negative p_delta = outflow.
-- p_outflow_kind in: 'spread' | 'drain' | NULL (for inflows)
CREATE OR REPLACE FUNCTION update_balance(
  p_wallet       TEXT,
  p_delta        NUMERIC,
  p_outflow_kind TEXT DEFAULT NULL
) RETURNS TABLE (
  current_balance         NUMERIC,
  peak_balance            NUMERIC,
  total_drain             NUMERIC,
  total_spread_outflow    NUMERIC,
  drain_pct               NUMERIC
) AS $$
DECLARE
  v_new_balance        NUMERIC;
  v_new_peak           NUMERIC;
  v_new_drain          NUMERIC;
  v_new_spread_outflow NUMERIC;
BEGIN
  INSERT INTO wallet_peaks (wallet, current_balance, peak_balance, last_updated)
    VALUES (p_wallet, GREATEST(0, p_delta), GREATEST(0, p_delta), NOW())
  ON CONFLICT (wallet) DO NOTHING;

  UPDATE wallet_peaks
     SET current_balance = GREATEST(0, wallet_peaks.current_balance + p_delta),
         peak_balance = GREATEST(
           wallet_peaks.peak_balance,
           wallet_peaks.current_balance + p_delta
         ),
         total_drain = wallet_peaks.total_drain
                       + CASE
                           WHEN p_delta < 0 AND p_outflow_kind = 'drain'
                           THEN ABS(p_delta) ELSE 0
                         END,
         total_spread_outflow = wallet_peaks.total_spread_outflow
                       + CASE
                           WHEN p_delta < 0 AND p_outflow_kind = 'spread'
                           THEN ABS(p_delta) ELSE 0
                         END,
         last_updated = NOW()
   WHERE wallet = p_wallet
   RETURNING wallet_peaks.current_balance, wallet_peaks.peak_balance,
             wallet_peaks.total_drain, wallet_peaks.total_spread_outflow
   INTO v_new_balance, v_new_peak, v_new_drain, v_new_spread_outflow;

  RETURN QUERY SELECT
    v_new_balance,
    v_new_peak,
    v_new_drain,
    v_new_spread_outflow,
    CASE WHEN v_new_peak > 0 THEN (v_new_drain / v_new_peak) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

-- Expire quarantines that have passed their cooldown.
-- Called periodically by the bot.
CREATE OR REPLACE FUNCTION expire_quarantines()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE wallet_scores
     SET status = 'active',
         quarantine_until = NULL,
         last_updated = NOW()
   WHERE status = 'quarantined'
     AND quarantine_until IS NOT NULL
     AND quarantine_until <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Bootstrap Patient Zero (idempotent, called by bot at startup).
CREATE OR REPLACE FUNCTION bootstrap_patient_zero(
  p_wallet  TEXT,
  p_r_floor INT DEFAULT 10
) RETURNS VOID AS $$
BEGIN
  INSERT INTO wallet_scores (wallet, r_score, status, last_updated)
    VALUES (p_wallet, p_r_floor, 'patient_zero', NOW())
  ON CONFLICT (wallet) DO UPDATE
    SET r_score = p_r_floor,
        status = 'patient_zero',
        last_updated = NOW();

  UPDATE config SET patient_zero_wallet = p_wallet WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- VIEWS
-- =====================================================================

-- top_carriers — leaderboard of active wallets by R, excluding Patient Zero.
CREATE OR REPLACE VIEW top_carriers AS
SELECT
  ws.wallet,
  ws.r_score,
  ws.spread_count,
  ws.status,
  COALESCE(wp.current_balance, 0)      AS current_balance,
  COALESCE(wp.peak_balance, 0)         AS peak_balance,
  COALESCE(wp.total_drain, 0)          AS total_drain,
  COALESCE(wp.total_spread_outflow, 0) AS total_spread_outflow,
  CASE WHEN COALESCE(wp.peak_balance, 0) > 0
       THEN (COALESCE(wp.total_drain, 0) / wp.peak_balance) * 100
       ELSE 0
  END AS drain_pct,
  ws.last_updated
FROM wallet_scores ws
LEFT JOIN wallet_peaks wp ON wp.wallet = ws.wallet
WHERE ws.status = 'active'
  AND ws.r_score > 0
ORDER BY ws.r_score DESC, ws.last_updated ASC;

-- live_feed — unified event stream (spreads + forfeits + trades), newest first.
CREATE OR REPLACE VIEW live_feed AS
SELECT
  'spread' AS event_type,
  s.signature || ':' || s.log_index AS event_id,
  s.observed_at AS event_at,
  jsonb_build_object(
    'sender', s.sender,
    'recipient', s.recipient,
    'amount_tokens', s.amount_tokens,
    'valid', s.valid,
    'rejection_reason', s.rejection_reason
  ) AS payload
FROM spreads s
UNION ALL
SELECT
  'forfeiture' AS event_type,
  f.id::TEXT AS event_id,
  f.occurred_at AS event_at,
  jsonb_build_object(
    'wallet', f.wallet,
    'r_at_forfeit', f.r_at_forfeit,
    'peak_at_forfeit', f.peak_at_forfeit,
    'drain_pct', f.drain_pct,
    'quarantine_until', f.quarantine_until
  ) AS payload
FROM forfeitures f
UNION ALL
SELECT
  'trade' AS event_type,
  t.signature AS event_id,
  t.observed_at AS event_at,
  jsonb_build_object(
    'direction', t.direction,
    'wallet', t.wallet_address,
    'sol_amount', t.sol_amount,
    'fee_amount_sol', t.fee_amount_sol,
    'venue', t.venue
  ) AS payload
FROM trades t
ORDER BY event_at DESC;

-- pool_status — live pool metrics for the status panel.
CREATE OR REPLACE VIEW pool_status AS
SELECT
  (SELECT COUNT(*) FROM wallet_scores WHERE r_score > 0 AND status = 'active') AS active_carriers,
  (SELECT COALESCE(SUM(r_score), 0) FROM wallet_scores WHERE status = 'active') AS total_r,
  (SELECT COUNT(*) FROM spreads WHERE valid = TRUE) AS total_spreads,
  (SELECT COUNT(*) FROM forfeitures WHERE occurred_at > NOW() - INTERVAL '24 hours') AS forfeitures_24h,
  (SELECT COALESCE(SUM(amount_sol), 0) FROM distributions WHERE status = 'confirmed') AS total_distributed_sol,
  (SELECT MAX(observed_at) FROM trades) AS last_trade_at;

-- infection_edges — for force-graph: every valid spread is an edge.
CREATE OR REPLACE VIEW infection_edges AS
SELECT
  s.sender AS source,
  s.recipient AS target,
  MIN(s.observed_at) AS first_at,
  MAX(s.amount_tokens) AS amount_tokens,
  COUNT(*) AS edge_count
FROM spreads s
WHERE s.valid = TRUE
GROUP BY s.sender, s.recipient;

-- infection_nodes — for force-graph: every wallet ever scored or peaked.
CREATE OR REPLACE VIEW infection_nodes AS
SELECT
  COALESCE(ws.wallet, wp.wallet) AS wallet,
  COALESCE(ws.r_score, 0) AS r_score,
  COALESCE(ws.status, 'active') AS status,
  COALESCE(ws.spread_count, 0) AS spread_count,
  COALESCE(wp.current_balance, 0) AS current_balance,
  COALESCE(wp.peak_balance, 0) AS peak_balance,
  ws.quarantine_until
FROM wallet_scores ws
FULL OUTER JOIN wallet_peaks wp ON wp.wallet = ws.wallet;

-- =====================================================================
-- ROW-LEVEL SECURITY
-- Bot uses service-role (bypasses RLS). Frontend uses anon (read-only).
-- =====================================================================
ALTER TABLE config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_peaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_metadata   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE spreads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE forfeitures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read config"          ON config          FOR SELECT USING (true);
CREATE POLICY "public read wallet_scores"   ON wallet_scores   FOR SELECT USING (true);
CREATE POLICY "public read wallet_peaks"    ON wallet_peaks    FOR SELECT USING (true);
CREATE POLICY "public read trades"          ON trades          FOR SELECT USING (true);
CREATE POLICY "public read spreads"         ON spreads         FOR SELECT USING (true);
CREATE POLICY "public read forfeitures"     ON forfeitures     FOR SELECT USING (true);
CREATE POLICY "public read distributions"   ON distributions   FOR SELECT USING (true);
-- wallet_metadata + webhook_events: no public read

-- =====================================================================
-- REALTIME publication — Supabase pushes changes to subscribed clients.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE wallet_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_peaks;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE spreads;
ALTER PUBLICATION supabase_realtime ADD TABLE forfeitures;
ALTER PUBLICATION supabase_realtime ADD TABLE distributions;
