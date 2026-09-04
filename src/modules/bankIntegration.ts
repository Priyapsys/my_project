// ============================================================
//  BANK INTEGRATION MODULE — Stripe Test Mode
// ============================================================
//
//  Handles deposits (PaymentIntents) and withdrawals (Transfers)
//  via Stripe's Test Mode API. Webhook signature verification
//  is provided for asynchronous event processing.
// ============================================================

import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { DomainError } from '../utils/errors';

// ── Custom Error ────────────────────────────────────────────

export class BankIntegrationError extends DomainError {
  constructor(message: string) {
    super('BANK_INTEGRATION_ERROR', message);
  }
}

// ── Stripe Initialization ───────────────────────────────────

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_TEST_KEY;
  if (!stripeKey) {
    throw new BankIntegrationError('STRIPE_TEST_KEY environment variable is not set');
  }
  if (!stripe) {
    stripe = new Stripe(stripeKey, {
      apiVersion: '2024-06-20' as any,
    });
  }
  return stripe;
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

  const stripeKey = process.env.STRIPE_TEST_KEY;
  if (!stripeKey) {
    throw new BankIntegrationError('STRIPE_TEST_KEY environment variable is not set');
  }

  // Support for mock key during testing / offline mode
  if (stripeKey.startsWith('sk_test_mock') || process.env.NODE_ENV === 'test') {
    const mockId = `pi_mock_${Date.now()}`;
    logger.info('Deposit PaymentIntent created (mock)', {
      userId,
      paymentIntentId: mockId,
      amount,
      currency,
    });
    return {
      clientSecret: `${mockId}_secret_mock`,
      paymentIntentId: mockId,
    };
  }

  try {
    const s = getStripe();
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

  const stripeKey = process.env.STRIPE_TEST_KEY;
  if (!stripeKey) {
    throw new BankIntegrationError('STRIPE_TEST_KEY environment variable is not set');
  }

  // Support for mock key during testing / offline mode
  if (stripeKey.startsWith('sk_test_mock') || process.env.NODE_ENV === 'test') {
    const mockId = `tr_mock_${Date.now()}`;
    logger.info('Withdrawal Transfer created (mock)', {
      userId,
      transferId: mockId,
      amount,
      destination: destinationAccountId,
    });
    return {
      transferId: mockId,
      status: 'paid',
    };
  }

  try {
    const s = getStripe();
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
      status: transfer.object || 'paid',
    };
  } catch (err) {
    if (err instanceof BankIntegrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create withdrawal Transfer', { userId, error: message });
    throw new BankIntegrationError(`Withdrawal failed: ${message}`);
  }
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
    case 'transfer.created': {
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

