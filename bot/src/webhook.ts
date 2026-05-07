/**
 * webhook.ts — Helius webhook ingress.
 *
 * Validates payload, persists raw event for audit, then delegates each
 * parsed event (swap or spread) to the orchestrator.
 */

import type { Request, Response } from 'express';
import { logger } from './logger.js';
import { config } from './config.js';
import { db } from './db.js';
import { parseHeliusWebhookPayload } from './pump.js';
import { processEvent } from './event-processor.js';

export async function handleHeliusWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  // Always 200 quickly — Helius retries on non-2xx
  res.status(200).json({ received: true });

  // Optional shared-secret validation
  if (config.HELIUS_WEBHOOK_SECRET) {
    const provided =
      req.header('authorization') || req.header('x-helius-signature');
    if (provided !== config.HELIUS_WEBHOOK_SECRET) {
      logger.warn(
        { headers: Object.keys(req.headers) },
        'webhook auth mismatch',
      );
      return;
    }
  }

  // Audit log — store raw payload regardless of parse outcome
  try {
    await db.from('webhook_events').insert({
      source: 'helius',
      event_type: 'enhanced_transaction',
      raw_payload: req.body,
    });
  } catch (err) {
    logger.warn({ err }, 'webhook audit insert failed');
  }

  if (!config.TOKEN_MINT) {
    logger.warn('TOKEN_MINT not configured — skipping webhook processing');
    return;
  }

  const events = parseHeliusWebhookPayload(req.body, config.TOKEN_MINT);

  if (events.length === 0) {
    logger.debug(
      { keys: Object.keys(req.body ?? {}) },
      'webhook had no relevant events',
    );
    return;
  }

  // Process events sequentially by slot order (oldest first) for determinism
  events.sort((a, b) => a.slot - b.slot);

  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      logger.error(
        { err, signature: event.signature, kind: event.kind },
        'processEvent unrecoverable',
      );
    }
  }
}
