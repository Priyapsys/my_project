// ============================================================
//  ROUTE: POST /api/webhooks/stripe — Stripe Webhook Handler
// ============================================================
//
//  IMPORTANT: This route must receive raw body (not JSON parsed).
//  The server.ts must apply express.raw() BEFORE this route is mounted.
// ============================================================

import { Router, Request, Response } from 'express';
import {
  handleStripeWebhook,
  BankIntegrationError,
  getWithdrawalRecordByTransferId,
  updateWithdrawalStatus,
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
        if (transferId) {
          const db = getDb();
          await db.transaction(async (trx) => {
            const record = await getWithdrawalRecordByTransferId(transferId, trx);
            if (record && record.status === 'pending') {
              const debitUser = userId || record.user_id;
              const debitAmount = amount || record.amount;
              const debitCurrency = (record.currency || 'USD') as Currency;

              // Finalize debit on ledger when Stripe transfer completes
              await debit(debitUser, debitCurrency, debitAmount, trx, record.id);
              await updateWithdrawalStatus(record.id, 'completed', trx);

              logger.info('Withdrawal transfer paid & ledger debited', {
                userId: debitUser,
                transferId,
                amount: debitAmount,
                requestId: record.id,
              });
            } else {
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
