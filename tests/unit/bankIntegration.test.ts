// ============================================================
//  BANK INTEGRATION MODULE & ROUTES — Unit & Integration Tests
// ============================================================

import request from 'supertest';
import express from 'express';
import {
  createDepositIntent,
  processWithdrawal,
  handleStripeWebhook,
  BankIntegrationError,
  getUserWithdrawalRecords,
  getWithdrawalRecordByTransferId,
} from '../../src/modules/bankIntegration';
import depositRoute from '../../src/routes/deposit';
import withdrawRoute from '../../src/routes/withdraw';
import webhookRoute from '../../src/routes/webhooks';
import { issueToken } from '../../src/middleware/auth';
import { initDatabase, closeDatabase, getDb } from '../../src/db/connection';
import { getAvailableBalance, getBalanceForCurrency, setBalance } from '../../src/modules/ledger';

// ── Mock Stripe SDK ──────────────────────────────────────────
const mockPaymentIntentsCreate = jest.fn();
const mockTransfersCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
    },
    transfers: {
      create: mockTransfersCreate,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

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

  beforeAll(async () => {
    try {
      await initDatabase();
    } catch (e) {}
  });

  afterAll(async () => {
    try {
      await closeDatabase();
    } catch (e) {}
    process.env = originalEnv;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      STRIPE_TEST_KEY: 'sk_test_mock_12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    };

    // Default mock behaviors
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });

    mockTransfersCreate.mockResolvedValue({
      id: 'tr_test_123',
      object: 'transfer',
    });

    try {
      const db = getDb();
      await db('withdrawal_requests').del();
      await db('accounts').del();
    } catch (e) {}
  });

  describe('TASK 1: Stripe Real SDK Calls & Startup Guard', () => {
    it('throws error when STRIPE_TEST_KEY is missing', async () => {
      delete process.env.STRIPE_TEST_KEY;
      await expect(createDepositIntent('alice', 100, 'USD')).rejects.toThrow(
        'STRIPE_TEST_KEY environment variable is not set'
      );
    });

    it('throws error immediately when live Stripe key (sk_live_) is provided', async () => {
      process.env.STRIPE_TEST_KEY = 'sk_live_secret123456';
      await expect(createDepositIntent('alice', 100, 'USD')).rejects.toThrow(
        'Live Stripe key detected'
      );
    });

    it('throws error when STRIPE_TEST_KEY does not start with sk_test_', async () => {
      process.env.STRIPE_TEST_KEY = 'invalid_prefix_key';
      await expect(createDepositIntent('alice', 100, 'USD')).rejects.toThrow(
        'Invalid STRIPE_TEST_KEY format'
      );
    });

    it('createDepositIntent calls stripe.paymentIntents.create and returns result', async () => {
      const res = await createDepositIntent('alice', 100, 'USD');
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'usd',
        metadata: { userId: 'alice', type: 'deposit' },
      });
      expect(res.paymentIntentId).toBe('pi_test_123');
      expect(res.clientSecret).toBe('pi_test_123_secret');
    });

    it('processWithdrawal calls stripe.transfers.create and returns result', async () => {
      const res = await processWithdrawal('alice', 50, 'acct_destination_123');
      expect(mockTransfersCreate).toHaveBeenCalledWith({
        amount: 5000,
        currency: 'usd',
        destination: 'acct_destination_123',
        metadata: { userId: 'alice', type: 'withdrawal' },
      });
      expect(res.transferId).toBe('tr_test_123');
      expect(res.status).toBe('pending');
    });

    it('handleStripeWebhook parses transfer.failed event correctly', () => {
      const payload = JSON.stringify({
        type: 'transfer.failed',
        data: {
          object: {
            id: 'tr_failed_99',
            amount: 2500,
            currency: 'usd',
            metadata: { userId: 'charlie' },
          },
        },
      });

      const event = handleStripeWebhook('mock_sig', payload);
      expect(event.type).toBe('transfer.failed');
      expect(event.data.userId).toBe('charlie');
      expect(event.data.amount).toBe(25);
      expect(event.data.transferId).toBe('tr_failed_99');
    });
  });

  describe('TASK 2: Withdrawal Debit-Ordering & Webhook Holds', () => {
    const app = buildApp();
    const token = issueToken('alice');

    it('successful withdrawal: hold placed -> Stripe transfer succeeds -> transfer.paid webhook -> balance debited', async () => {
      await setBalance('alice', 'USD', 100);

      // 1. Initiate withdrawal of 40 USD
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 40, destinationAccountId: 'acct_123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.transferId).toBe('tr_test_123');

      // Check balance: raw account balance is still 100 USD (debit not applied yet), available is 60 USD
      const rawBalance = await getBalanceForCurrency('alice', 'USD');
      const availBalance = await getAvailableBalance('alice', 'USD');
      expect(rawBalance).toBe(100);
      expect(availBalance).toBe(60);

      // 2. Send transfer.paid webhook
      const webhookPayload = JSON.stringify({
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 4000,
            currency: 'usd',
            metadata: { userId: 'alice' },
          },
        },
      });

      const webhookRes = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(webhookRes.status).toBe(200);

      // Raw balance is now 60 USD, withdrawal request status is completed
      const finalBalance = await getBalanceForCurrency('alice', 'USD');
      expect(finalBalance).toBe(60);

      const record = await getWithdrawalRecordByTransferId('tr_test_123');
      expect(record?.status).toBe('completed');
    });

    it('failed withdrawal: hold placed -> transfer.failed webhook -> balance restored', async () => {
      await setBalance('alice', 'USD', 100);

      // 1. Initiate withdrawal of 40 USD
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 40, destinationAccountId: 'acct_123' });

      expect(res.status).toBe(200);
      expect(await getAvailableBalance('alice', 'USD')).toBe(60);

      // 2. Send transfer.failed webhook
      const webhookPayload = JSON.stringify({
        type: 'transfer.failed',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 4000,
            currency: 'usd',
            metadata: { userId: 'alice' },
          },
        },
      });

      const webhookRes = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(webhookRes.status).toBe(200);

      // Balance is fully restored (hold released)
      expect(await getBalanceForCurrency('alice', 'USD')).toBe(100);
      expect(await getAvailableBalance('alice', 'USD')).toBe(100);

      const record = await getWithdrawalRecordByTransferId('tr_test_123');
      expect(record?.status).toBe('failed');
    });

    it('duplicate transfer.failed webhook does not double-credit ledger', async () => {
      await setBalance('alice', 'USD', 100);

      await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 40, destinationAccountId: 'acct_123' });

      const webhookPayload = JSON.stringify({
        type: 'transfer.failed',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 4000,
            currency: 'usd',
            metadata: { userId: 'alice' },
          },
        },
      });

      // Send webhook first time
      await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      // Send webhook second time (duplicate)
      await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(await getBalanceForCurrency('alice', 'USD')).toBe(100);
      expect(await getAvailableBalance('alice', 'USD')).toBe(100);
    });

    it('rejects withdrawal if available balance (accounting for pending holds) is insufficient', async () => {
      await setBalance('alice', 'USD', 100);

      // Pending hold of 70 USD
      await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 70, destinationAccountId: 'acct_123' });

      expect(await getAvailableBalance('alice', 'USD')).toBe(30);

      // Request another withdrawal of 50 USD -> should fail (30 available < 50)
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50, destinationAccountId: 'acct_123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('GET /api/withdraw lists requests and distinguishes pending from completed', async () => {
      await setBalance('alice', 'USD', 200);

      await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50, destinationAccountId: 'acct_123' });

      const listRes = await request(app)
        .get('/api/withdraw')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].status).toBe('pending');
    });
  });
});
