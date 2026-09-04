// ============================================================
//  ROUTE: POST /api/webhooks/stripe — Stripe Webhook Handler
// ============================================================
//
//  IMPORTANT: This route must receive raw body (not JSON parsed).
//  The server.ts must apply express.raw() BEFORE this route is mounted.
// ============================================================

import { Router, Request, Response } from 'express';
import { handleStripeWebhook, BankIntegrationError } from '../modules/bankIntegration';
import { credit } from '../modules/ledger';
import { Currency } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/webhooks/stripe — handle Stripe webhook events
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    const event = handleStripeWebhook(signature, req.body);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const { userId, amount, currency } = event.data;
        if (userId && amount && currency) {
          // Credit the user's internal ledger after successful Stripe deposit
          await credit(userId, currency as Currency, amount);
          logger.info('Deposit credited to ledger', { userId, amount, currency });
        }
        break;
      }

      case 'transfer.paid': {
        const { userId, transferId, amount } = event.data;
        logger.info('Withdrawal transfer completed', { userId, transferId, amount });
        // Withdrawal already debited from ledger at request time — this is confirmation only
        break;
      }

      default:
        logger.debug(`Unhandled webhook event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    logger.error('Stripe webhook error', { error: message });

    // Return 400 for signature verification failures so Stripe retries
    const statusCode = err instanceof BankIntegrationError ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
});

export default router;
