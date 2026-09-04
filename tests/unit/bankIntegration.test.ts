// ============================================================
//  BANK INTEGRATION MODULE & ROUTES — Unit Tests
// ============================================================

import request from 'supertest';
import express from 'express';
import { createDepositIntent, processWithdrawal, handleStripeWebhook, BankIntegrationError } from '../../src/modules/bankIntegration';
import depositRoute from '../../src/routes/deposit';
import withdrawRoute from '../../src/routes/withdraw';
import webhookRoute from '../../src/routes/webhooks';
import { issueToken } from '../../src/middleware/auth';
import * as ledger from '../../src/modules/ledger';

// Mock ledger functions for unit tests
jest.mock('../../src/modules/ledger', () => ({
  debit: jest.fn(),
  credit: jest.fn(),
}));

function buildApp() {
  const app = express();
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoute);
  app.use(express.json());
  app.use('/api/deposit', depositRoute);
  app.use('/api/withdraw', withdrawRoute);
  return app;
}

describe('Bank Integration Module & Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, STRIPE_TEST_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: 'whsec_mock' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('bankIntegration.ts functions', () => {
    it('createDepositIntent should return clientSecret and paymentIntentId', async () => {
      const res = await createDepositIntent('alice', 100, 'USD');
      expect(res.clientSecret).toBeTruthy();
      expect(res.paymentIntentId).toMatch(/^pi_/);
    });

    it('createDepositIntent should throw validation error for invalid amount', async () => {
      await expect(createDepositIntent('alice', 0, 'USD')).rejects.toThrow('greater than zero');
    });

    it('createDepositIntent should throw error when STRIPE_TEST_KEY is missing', async () => {
      delete process.env.STRIPE_TEST_KEY;
      delete process.env.NODE_ENV;
      await expect(createDepositIntent('alice', 100, 'USD')).rejects.toThrow('STRIPE_TEST_KEY environment variable is not set');
    });

    it('processWithdrawal should return transferId and status', async () => {
      const res = await processWithdrawal('alice', 50, 'acct_test_123');
      expect(res.transferId).toMatch(/^tr_/);
      expect(res.status).toBe('paid');
    });

    it('processWithdrawal should throw validation error for invalid amount', async () => {
      await expect(processWithdrawal('alice', -10, 'acct_test_123')).rejects.toThrow('greater than zero');
    });

    it('handleStripeWebhook should parse payment_intent.succeeded', () => {
      const payload = JSON.stringify({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 5000,
            currency: 'usd',
            metadata: { userId: 'alice' },
          },
        },
      });

      const event = handleStripeWebhook('mock_sig', payload);
      expect(event.type).toBe('payment_intent.succeeded');
      expect(event.data.userId).toBe('alice');
      expect(event.data.amount).toBe(50);
      expect(event.data.currency).toBe('USD');
      expect(event.data.paymentIntentId).toBe('pi_123');
    });

    it('handleStripeWebhook should parse transfer.paid', () => {
      const payload = JSON.stringify({
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_123',
            amount: 3000,
            currency: 'usd',
            metadata: { userId: 'bob' },
          },
        },
      });

      const event = handleStripeWebhook('mock_sig', payload);
      expect(event.type).toBe('transfer.paid');
      expect(event.data.userId).toBe('bob');
      expect(event.data.transferId).toBe('tr_123');
    });

    it('handleStripeWebhook should throw error if secret is missing', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(() => handleStripeWebhook('mock_sig', '{}')).toThrow('STRIPE_WEBHOOK_SECRET environment variable is not set');
    });
  });

  describe('POST /api/deposit Route', () => {
    const app = buildApp();
    const token = issueToken('alice');

    it('returns 200 with clientSecret on valid deposit', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, currency: 'USD' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.clientSecret).toBeTruthy();
      expect(res.body.data.paymentIntentId).toBeTruthy();
    });

    it('returns 400 for missing or non-positive amount', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('returns 400 for missing currency', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('returns 401 when token is missing', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .send({ amount: 100, currency: 'USD' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/withdraw Route', () => {
    const app = buildApp();
    const token = issueToken('alice');

    it('returns 200 with transferId on valid withdrawal', async () => {
      (ledger.debit as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50, destinationAccountId: 'acct_123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transferId).toBeTruthy();
      expect(ledger.debit).toHaveBeenCalledWith('alice', 'USD', 50);
    });

    it('returns 400 when debit fails due to insufficient funds', async () => {
      const { InsufficientBalanceError } = jest.requireActual('../../src/utils/errors');
      (ledger.debit as jest.Mock).mockRejectedValueOnce(new InsufficientBalanceError('alice', 10, 50, 'USD'));

      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50, destinationAccountId: 'acct_123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('returns 400 for missing destinationAccountId', async () => {
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });
  });

  describe('POST /api/webhooks/stripe Route', () => {
    const app = buildApp();

    it('credits ledger on payment_intent.succeeded', async () => {
      (ledger.credit as jest.Mock).mockResolvedValueOnce(undefined);

      const payload = JSON.stringify({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_999',
            amount: 10000,
            currency: 'usd',
            metadata: { userId: 'alice' },
          },
        },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(ledger.credit).toHaveBeenCalledWith('alice', 'USD', 100);
    });

    it('returns 400 if stripe-signature is missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/stripe')
        .send({ type: 'payment_intent.succeeded' });

      expect(res.status).toBe(400);
    });
  });
});
