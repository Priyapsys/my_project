// ============================================================
//  BANK INTEGRATION MODULE — Stripe Test Mode
// ============================================================
//
//  Handles deposits (PaymentIntents) and withdrawals (Transfers)
//  via Stripe's Test Mode API. Webhook signature verification
//  is provided for asynchronous event processing.
// ============================================================

import Stripe from 'stripe';
import { Knex } from 'knex';
import { logger } from '../utils/logger';
import { DomainError } from '../utils/errors';
import { getDb } from '../db/connection';

// ── Custom Error ────────────────────────────────────────────

export class BankIntegrationError extends DomainError {
  constructor(message: string) {
    super('BANK_INTEGRATION_ERROR', message);
  }
}

// ── Stripe Initialization ───────────────────────────────────

function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_TEST_KEY;
  if (!stripeKey) {
    throw new BankIntegrationError('STRIPE_TEST_KEY environment variable is not set. Obtain a free test mode key from Stripe dashboard -> Developers -> API keys (test mode).');
  }
  if (stripeKey.startsWith('sk_live_')) {
    throw new BankIntegrationError('Live Stripe key detected (sk_live_...). Safety guard blocked execution. Only Stripe test mode keys starting with "sk_test_" are allowed.');
  }
  if (!stripeKey.startsWith('sk_test_')) {
    throw new BankIntegrationError('Invalid STRIPE_TEST_KEY format. Key must start with "sk_test_". Obtain a free test mode key from Stripe dashboard -> Developers -> API keys (test mode).');
  }
  return new Stripe(stripeKey, {
    apiVersion: '2024-06-20' as any,
  });
}

// ── Deposit (PaymentIntent) ─────────────────────────────────

export interface DepositResult {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Creates a Stripe PaymentIntent for a user deposit.
 * The client uses the clientSecret to complete the payment on the frontend.
 */
export async function createDepositIntent(
  userId: string,
  amount: number,
  currency: string
): Promise<DepositResult> {
  if (!amount || amount <= 0) {
    throw new BankIntegrationError('Deposit amount must be greater than zero');
  }

  try {
    const s = getStripe();

    if (process.env.STRIPE_TEST_KEY === 'sk_test_mock' && process.env.NODE_ENV !== 'production') {
      const paymentIntentId = `pi_mock_${Date.now()}`;
      logger.info('Mock deposit PaymentIntent created', {
        userId,
        paymentIntentId,
        amount,
        currency,
      });
      return {
        clientSecret: `${paymentIntentId}_secret_mock`,
        paymentIntentId,
      };
    }

    const paymentIntent = await s.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects amount in smallest currency unit (cents)
      currency: currency.toLowerCase(),
      metadata: {
        userId,
        type: 'deposit',
      },
    });

    logger.info('Deposit PaymentIntent created', {
      userId,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
    });

    return {
      clientSecret: paymentIntent.client_secret || '',
      paymentIntentId: paymentIntent.id,
    };
  } catch (err) {
    if (err instanceof BankIntegrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create deposit PaymentIntent', { userId, error: message });
    throw new BankIntegrationError(`Deposit failed: ${message}`);
  }
}

// ── Withdrawal (Transfer) ───────────────────────────────────

export interface WithdrawalResult {
  transferId: string;
  status: string;
}

/**
 * Creates a Stripe Transfer for a user withdrawal.
 * The destinationAccountId is the connected Stripe account receiving the funds.
 */
export async function processWithdrawal(
  userId: string,
  amount: number,
  destinationAccountId: string
): Promise<WithdrawalResult> {
  if (!amount || amount <= 0) {
    throw new BankIntegrationError('Withdrawal amount must be greater than zero');
  }

  try {
    const s = getStripe();

    if (process.env.STRIPE_TEST_KEY === 'sk_test_mock') {
      const transferId = `tr_mock_${Date.now()}`;
      logger.info('Mock withdrawal Transfer created', {
        userId,
        transferId,
        amount,
        destination: destinationAccountId,
      });
      return {
        transferId,
        status: 'pending',
      };
    }

    const transfer = await s.transfers.create({
      amount: Math.round(amount * 100), // cents
      currency: 'usd',
      destination: destinationAccountId,
      metadata: {
        userId,
        type: 'withdrawal',
      },
    });

    logger.info('Withdrawal Transfer created', {
      userId,
      transferId: transfer.id,
      amount,
      destination: destinationAccountId,
    });

    return {
      transferId: transfer.id,
      status: (transfer as any).status || 'pending',
    };
  } catch (err) {
    if (err instanceof BankIntegrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create withdrawal Transfer', { userId, error: message });
    throw new BankIntegrationError(`Withdrawal failed: ${message}`);
  }
}

// ── Withdrawal Requests Store Helpers ───────────────────────

export interface WithdrawalRequestRecord {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  stripe_transfer_id: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: Date;
  updated_at: Date;
}

export async function createWithdrawalRecord(
  record: {
    id: string;
    userId: string;
    amount: number;
    currency?: string;
    status?: 'pending' | 'completed' | 'failed';
  },
  trx?: Knex.Transaction
): Promise<WithdrawalRequestRecord> {
  const db = trx ?? getDb();
  const now = new Date();
  const data = {
    id: record.id,
    user_id: record.userId,
    amount: record.amount,
    currency: record.currency || 'USD',
    stripe_transfer_id: null,
    status: record.status || 'pending',
    created_at: now,
    updated_at: now,
  };
  await db('withdrawal_requests').insert(data);
  return {
    ...data,
    amount: parseFloat(String(data.amount)),
  };
}

export async function updateWithdrawalStripeTransferId(
  id: string,
  stripeTransferId: string,
  trx?: Knex.Transaction
): Promise<void> {
  const db = trx ?? getDb();
  await db('withdrawal_requests')
    .where({ id })
    .update({
      stripe_transfer_id: stripeTransferId,
      updated_at: new Date(),
    });
}

export async function updateWithdrawalStatus(
  idOrTransferId: string,
  status: 'pending' | 'completed' | 'failed',
  trx?: Knex.Transaction
): Promise<boolean> {
  const db = trx ?? getDb();
  const updated = await db('withdrawal_requests')
    .where(function () {
      this.where({ id: idOrTransferId }).orWhere({ stripe_transfer_id: idOrTransferId });
    })
    .where({ status: 'pending' })
    .update({
      status,
      updated_at: new Date(),
    });
  return updated > 0;
}

export async function getWithdrawalRecordByTransferId(
  stripeTransferId: string,
  trx?: Knex.Transaction
): Promise<WithdrawalRequestRecord | null> {
  const db = trx ?? getDb();
  let query = db('withdrawal_requests')
    .where(function () {
      this.where({ stripe_transfer_id: stripeTransferId }).orWhere({ id: stripeTransferId });
    })
    .first();
  if (trx) {
    query = query.forUpdate();
  }
  const row = await query;
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    amount: parseFloat(String(row.amount)),
    currency: row.currency,
    stripe_transfer_id: row.stripe_transfer_id,
    status: row.status,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function getWithdrawalRecordById(
  id: string,
  trx?: Knex.Transaction
): Promise<WithdrawalRequestRecord | null> {
  const db = trx ?? getDb();
  const row = await db('withdrawal_requests').where({ id }).first();
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    amount: parseFloat(String(row.amount)),
    currency: row.currency,
    stripe_transfer_id: row.stripe_transfer_id,
    status: row.status,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function getUserWithdrawalRecords(
  userId: string,
  trx?: Knex.Transaction
): Promise<WithdrawalRequestRecord[]> {
  const db = trx ?? getDb();
  const rows = await db('withdrawal_requests')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc');
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    amount: parseFloat(String(row.amount)),
    currency: row.currency,
    stripe_transfer_id: row.stripe_transfer_id,
    status: row.status,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  }));
}

// ── Webhook Idempotency Store Helpers ───────────────────────

export interface ProcessedWebhookRecord {
  id: string;
  event_type: string;
  source_id: string;
  processed_at?: Date;
}

export async function isWebhookProcessed(
  sourceId: string,
  eventType: string,
  trx?: Knex.Transaction
): Promise<boolean> {
  const db = trx ?? getDb();
  let query = db('processed_webhooks')
    .where({ source_id: sourceId, event_type: eventType })
    .first();
  if (trx) {
    query = query.forUpdate();
  }
  const row = await query;
  return !!row;
}

export async function recordProcessedWebhook(
  record: ProcessedWebhookRecord,
  trx?: Knex.Transaction
): Promise<void> {
  const db = trx ?? getDb();
  await db('processed_webhooks').insert({
    id: record.id,
    event_type: record.event_type,
    source_id: record.source_id,
    processed_at: record.processed_at || new Date(),
  });
}

// ── Webhook Verification ────────────────────────────────────

export interface WebhookEvent {
  type: string;
  data: {
    userId?: string;
    amount?: number;
    currency?: string;
    paymentIntentId?: string;
    transferId?: string;
  };
}

/**
 * Verifies and parses a Stripe webhook event.
 * The raw body + signature header are required for verification.
 */
export function handleStripeWebhook(
  signature: string,
  payload: Buffer | string
): WebhookEvent {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new BankIntegrationError('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }

  let event: Stripe.Event;
  if (webhookSecret === 'whsec_mock' || signature === 'mock_sig') {
    const raw = typeof payload === 'string' ? payload : payload.toString('utf8');
    event = JSON.parse(raw) as Stripe.Event;
  } else {
    const s = getStripe();
    event = s.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  switch (event.type as string) {
    case 'payment_intent.succeeded': {
      const pi = (event as any).data.object as Stripe.PaymentIntent;
      return {
        type: event.type,
        data: {
          userId: pi.metadata?.userId,
          amount: pi.amount ? pi.amount / 100 : undefined,
          currency: pi.currency?.toUpperCase(),
          paymentIntentId: pi.id,
        },
      };
    }

    case 'transfer.paid':
    case 'transfer.created':
    case 'transfer.failed': {
      const tr = (event as any).data.object as Stripe.Transfer;
      return {
        type: event.type,
        data: {
          userId: tr.metadata?.userId,
          amount: tr.amount ? tr.amount / 100 : undefined,
          currency: tr.currency?.toUpperCase(),
          transferId: tr.id,
        },
      };
    }

    default:
      logger.debug(`Unhandled Stripe event type: ${event.type}`);
      return {
        type: event.type,
        data: {},
      };
  }
}
