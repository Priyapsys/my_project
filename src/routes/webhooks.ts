// ============================================================
//  ROUTE: POST /api/webhooks/stripe — Stripe Webhook Handler
// ============================================================
//
//  IMPORTANT: This route must receive raw body (not JSON parsed).
//  The server.ts must apply express.raw() BEFORE this route is mounted.
// ============================================================

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  handleStripeWebhook,
  BankIntegrationError,
  getWithdrawalRecordByTransferId,
  updateWithdrawalStatus,
  isWebhookProcessed,
  recordProcessedWebhook,
} from '../modules/bankIntegration';
import { credit, debit } from '../modules/ledger';
import { Currency } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';

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
        const { userId, amount, currency, paymentIntentId } = event.data;
        if (userId && amount && currency) {
          const db = getDb();
          await db.transaction(async (trx) => {
            const sourceId = paymentIntentId || `pi_unknown_${userId}_${amount}`;
            const alreadyProcessed = await isWebhookProcessed(sourceId, event.type, trx);
            if (alreadyProcessed) {
              logger.info('payment_intent.succeeded already processed, skipping credit (idempotent)', {
                sourceId,
                userId,
              });
              return;
            }

            // Credit the user's internal ledger after successful Stripe deposit
            await credit(userId, currency as Currency, amount, trx);
            await recordProcessedWebhook({
              id: uuidv4(),
              event_type: event.type,
              source_id: sourceId,
            }, trx);

            logger.info('Deposit credited to ledger & recorded in processed_webhooks', {
              userId,
              amount,
              currency,
              paymentIntentId: sourceId,
            });
          });
        }
        break;
      }

      case 'transfer.paid': {
        const { userId, transferId, amount } = event.data;
        if (transferId) {
          const db = getDb();
          await db.transaction(async (trx) => {
            const alreadyProcessed = await isWebhookProcessed(transferId, event.type, trx);
            if (alreadyProcessed) {
              logger.info('transfer.paid already processed, skipping debit (idempotent)', {
                transferId,
              });
              return;
            }

            const record = await getWithdrawalRecordByTransferId(transferId, trx);
            if (record && record.status === 'pending') {
              const debitUser = userId || record.user_id;
              const debitAmount = amount || record.amount;
              const debitCurrency = (record.currency || 'USD') as Currency;

              // Finalize debit on ledger when Stripe transfer completes
              await debit(debitUser, debitCurrency, debitAmount, trx, record.id);
              await updateWithdrawalStatus(record.id, 'completed', trx);

              await recordProcessedWebhook({
                id: uuidv4(),
                event_type: event.type,
                source_id: transferId,
              }, trx);

              logger.info('Withdrawal transfer paid & ledger debited', {
                userId: debitUser,
                transferId,
                amount: debitAmount,
                requestId: record.id,
              });
            } else {
              // Record processed to ensure idempotency even if withdrawal was already completed/missing
              await recordProcessedWebhook({
                id: uuidv4(),
                event_type: event.type,
                source_id: transferId,
              }, trx);

              logger.info('Withdrawal transfer.paid ignored (already processed or unknown)', {
                transferId,
                recordStatus: record?.status,
              });
            }
          });
        }
        break;
      }

      case 'transfer.failed': {
        const { transferId } = event.data;
        if (transferId) {
          const db = getDb();
          await db.transaction(async (trx) => {
            const record = await getWithdrawalRecordByTransferId(transferId, trx);
            if (record && record.status === 'pending') {
              // Marking withdrawal request status as failed releases the pending hold.
              // Balance was not debited, so no ledger update is required. Idempotent check ensures duplicate webhooks do nothing.
              await updateWithdrawalStatus(record.id, 'failed', trx);

              logger.info('Withdrawal transfer failed & hold released', {
                transferId,
                requestId: record.id,
                userId: record.user_id,
              });
            } else {
              logger.info('Withdrawal transfer.failed ignored (already processed or unknown)', {
                transferId,
                recordStatus: record?.status,
              });
            }
          });
        }
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
