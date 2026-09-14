// ============================================================
//  INTEGRATION TEST: Idempotency on Deposit & Withdraw
// ============================================================

import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';
import { getAvailableBalance, getBalanceForCurrency } from '../../src/modules/ledger';

const mockPaymentIntentsCreate = jest.fn();
const mockTransfersCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
    },
    transfers: {
      create: mockTransfersCreate,
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

describe('Deposit & Withdraw Idempotency Integration', () => {
  const USER = 'idemp-dw-user';
  let token: string;

  beforeAll(async () => {
    process.env.STRIPE_TEST_KEY = 'sk_test_mock_dw_idemp';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock_dw';
    await initDatabase();
    token = issueToken(USER);
    await seedKycVerified([USER]);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });
    mockTransfersCreate.mockResolvedValue({
      id: 'tr_test_123',
      object: 'transfer',
    });

    const db = getDb();
    await db('idempotency_keys').del();
    await db('withdrawal_requests').del();
    await db('accounts').del();
    await db('transactions').del();
    await db('treasury_reserves').del();
    await db('settlement_queue').del();

    // Setup initial balance
    await db('accounts').insert({ user_id: USER, currency: 'USD', balance: 1000 });
  });

  describe('Deposit Idempotency', () => {
    it('duplicate deposit request with same key returns cached response and does not double-credit ledger in demo mode', async () => {
      const key = 'deposit-key-1';

      // First deposit (demo mode credits immediately)
      const res1 = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '200', currency: 'USD', demo: true });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const balanceAfterFirst = await getBalanceForCurrency(USER, 'USD');
      expect(balanceAfterFirst).toBe('1200.00');

      // Second deposit with SAME key and payload
      const res2 = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '200', currency: 'USD', demo: true });

      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);

      // Ledger must still be 1200, NOT 1400
      const balanceAfterSecond = await getBalanceForCurrency(USER, 'USD');
      expect(balanceAfterSecond).toBe('1200.00');
    });

    it('deposit with same key but different payload returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const key = 'deposit-reuse-key';

      // First request
      const res1 = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '100', currency: 'USD', demo: true });

      expect(res1.status).toBe(200);

      // Second request with different amount
      const res2 = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '250', currency: 'USD', demo: true });

      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('Withdraw Idempotency', () => {
    it('duplicate withdraw request with same key returns cached response and does not double-hold balance', async () => {
      const key = 'withdraw-key-1';

      // First withdrawal request
      const res1 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '300', destinationAccountId: 'acct_stripe_123' });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // Total balance is 1000, 300 on hold -> available is 700
      const availAfterFirst = await getAvailableBalance(USER, 'USD');
      expect(availAfterFirst).toBe('700.00');

      // Duplicate request with SAME key
      const res2 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '300', destinationAccountId: 'acct_stripe_123' });

      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);

      // Available balance must still be 700, NOT 400
      const availAfterSecond = await getAvailableBalance(USER, 'USD');
      expect(availAfterSecond).toBe('700.00');

      // Only one withdrawal request record should exist
      const db = getDb();
      const records = await db('withdrawal_requests').where({ user_id: USER });
      expect(records.length).toBe(1);
    });

    it('withdraw with same key but different payload returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const key = 'withdraw-reuse-key';

      const res1 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '100', destinationAccountId: 'acct_1' });

      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '200', destinationAccountId: 'acct_2' });

      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('Concurrent In-Flight Duplicate Requests', () => {
    it('concurrent duplicate requests with the same key are handled safely without duplicate processing', async () => {
      const key = 'concurrent-deposit-key';

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/deposit')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', key)
          .send({ amount: '150', currency: 'USD', demo: true }),
        request(app)
          .post('/api/deposit')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', key)
          .send({ amount: '150', currency: 'USD', demo: true }),
      ]);

      // At least one gets 200; the second gets either 200 (cached via polling) or 409 (if still pending)
      const okResponses = [res1, res2].filter((r) => r.status === 200);
      expect(okResponses.length).toBeGreaterThanOrEqual(1);

      // Ledger must only have been credited once (1000 + 150 = 1150)
      const balance = await getBalanceForCurrency(USER, 'USD');
      expect(balance).toBe('1150.00');
    });
  });

  describe('Failed Request Retry', () => {
    it('failed request allows retry with the same idempotency key', async () => {
      const key = 'retry-after-fail-key';

      // 1. Send withdrawal request with amount exceeding balance (1000 available, request 5000)
      const res1 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '5000', destinationAccountId: 'acct_retry_1' });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('INSUFFICIENT_FUNDS');

      // The key should now be in 'failed' status
      const db = getDb();
      const keyRow = await db('idempotency_keys')
        .where({ user_id: USER, idempotency_key: key })
        .first();
      expect(keyRow).toBeDefined();
      expect(keyRow.status).toBe('failed');

      // 2. Deposit funds to make balance sufficient (add 10000)
      await db('accounts').where({ user_id: USER, currency: 'USD' }).update({ balance: 10000 });

      // 3. Retry with the SAME idempotency key and valid payload
      const res2 = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ amount: '5000', destinationAccountId: 'acct_retry_1' });

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      const finalKeyRow = await db('idempotency_keys')
        .where({ user_id: USER, idempotency_key: key })
        .first();
      expect(finalKeyRow.status).toBe('succeeded');
    });
  });
});
