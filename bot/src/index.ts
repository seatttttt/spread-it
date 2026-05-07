/**
 * index.ts — boot sequence.
 *
 *   1. Validate env (config.ts already throws on bad values).
 *   2. Bootstrap Patient Zero in DB (idempotent).
 *   3. Start express server (health + webhook + dev test endpoints).
 *   4. Start reconciliation loop (stuck-distribution retry + quarantine expiry).
 *   5. Start claim loop (pump.fun creator-fee collection every 10s).
 *   6. Wire SIGTERM/SIGINT for graceful shutdown.
 */

import express, { type Request, type Response } from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { distributionWallet, isWalletConfigured } from './solana.js';
import { handleHeliusWebhook } from './webhook.js';
import { processEvent } from './event-processor.js';
import { buildMockSwap, buildMockSpread } from './pump.js';
import { startReconciliation } from './reconciliation.js';
import { startClaimLoop } from './claim.js';
import { bootstrapPatientZero } from './state.js';

const app = express();

app.use(express.json({ limit: '5mb' }));

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: isWalletConfigured && config.TOKEN_MINT ? 'ok' : 'standby',
    timestamp: new Date().toISOString(),
    network: config.SOLANA_NETWORK,
    distributionWallet: distributionWallet?.publicKey.toBase58() ?? null,
    nodeEnv: config.NODE_ENV,
    tokenMint: config.TOKEN_MINT ?? null,
    walletConfigured: isWalletConfigured,
    mechanic: {
      carrierMinPct: config.CARRIER_MIN_PCT,
      spreadMinPct: config.SPREAD_MIN_PCT,
      forfeitDrainPct: config.FORFEIT_DRAIN_PCT,
      quarantineHours: config.QUARANTINE_HOURS,
      patientZeroRFloor: config.PATIENT_ZERO_R_FLOOR,
    },
  });
});

// ---------------------------------------------------------------------------
// Helius webhook — primary event ingress
// ---------------------------------------------------------------------------
app.post('/webhook/helius', (req, res) => {
  void handleHeliusWebhook(req, res);
});

// ---------------------------------------------------------------------------
// DEV-ONLY: inject synthetic events for local testing
// ---------------------------------------------------------------------------
if (config.NODE_ENV === 'development') {
  app.post('/test/swap', async (req: Request, res: Response) => {
    try {
      const swap = buildMockSwap({
        direction: req.body.direction ?? 'buy',
        walletAddress:
          req.body.walletAddress ??
          distributionWallet?.publicKey.toBase58() ??
          'mock-wallet',
        solAmount: Number(req.body.solAmount ?? 0.5),
        tokenAmount: req.body.tokenAmount
          ? Number(req.body.tokenAmount)
          : undefined,
        venue: req.body.venue ?? 'bonding_curve',
      });
      await processEvent(swap);
      res.json({ ok: true, event: swap });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/test/spread', async (req: Request, res: Response) => {
    try {
      if (!req.body.sender || !req.body.recipient) {
        res.status(400).json({ ok: false, error: 'sender and recipient required' });
        return;
      }
      const spread = buildMockSpread({
        sender: req.body.sender,
        recipient: req.body.recipient,
        amountTokens: Number(req.body.amountTokens ?? 100_000),
      });
      await processEvent(spread);
      res.json({ ok: true, event: spread });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  logger.info('DEV mode: POST /test/swap and /test/spread enabled');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot(): Promise<void> {
  if (!distributionWallet) {
    logger.warn('STANDBY mode: DISTRIBUTION_WALLET_PRIVATE_KEY not set — bot will idle until configured');
    return;
  }
  // Bootstrap Patient Zero (the dev wallet) so it's visible in the tree
  // immediately and excluded from R-distribution.
  try {
    await bootstrapPatientZero(
      distributionWallet.publicKey.toBase58(),
      config.PATIENT_ZERO_R_FLOOR,
    );
    logger.info(
      {
        wallet: distributionWallet.publicKey.toBase58(),
        rFloor: config.PATIENT_ZERO_R_FLOOR,
      },
      'Patient Zero bootstrapped',
    );
  } catch (err) {
    logger.error({ err }, 'Patient Zero bootstrap failed (will retry next boot)');
  }
}

void boot();

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      network: config.SOLANA_NETWORK,
      wallet: distributionWallet?.publicKey.toBase58() ?? '(standby)',
      tokenMint: config.TOKEN_MINT ?? '(not set)',
    },
    '$SPREAD bot online',
  );
});

// Reconciliation: retry stuck distributions + expire quarantines
const reconcileTimer = startReconciliation();

// Creator-fee claim loop — pumps SOL from pump.fun/PumpSwap vaults into the
// distribution wallet so per-trade distributions stay funded.
const claimTimer = startClaimLoop(10_000);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  clearInterval(reconcileTimer as unknown as NodeJS.Timeout);
  clearInterval(claimTimer as unknown as NodeJS.Timeout);
  server.close(() => {
    logger.info('server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('forced exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});
