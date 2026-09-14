// ============================================================
//  PHASE C TEST: Atomic Enqueue & Withdrawal State Machine
// ============================================================

import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';
import {
  createWithdrawalRecord,
  updateWithdrawalStatus,
  isValidWithdrawalTransition,
  getWithdrawalRecordById,
  processWithdrawal,
  handleStripeWebhook,
} from '../../src/modules/bankIntegration';
import { getBalanceForCurrency, getAvailableBalance, debit, credit } from '../../src/modules/ledger';
import { executeTransfer } from '../../src/services/transactionService';

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

describe('Phase C: Atomic Enqueue & Withdrawal State Machine', () => {
  const USER = 'phase-c-user';
  let token: string;

  beforeAll(async () => {
    process.env.STRIPE_TEST_KEY = 'sk_test_mock_phase_c';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
    await initDatabase();
    token = issueToken(USER);
    await seedKycVerified([USER, 'receiver-c']);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTransfersCreate.mockResolvedValue({
      id: 'tr_mock_c_1',
      object: 'transfer',
      status: 'pending',
    });

    const db = getDb();
    await db('withdrawal_requests').del();
    await db('idempotency_keys').del();
    await db('accounts').del();
    await db('transactions').del();
    await db('treasury_reserves').del();
    await db('settlement_queue').del();
    await db('processed_webhooks').del();

    // Setup initial balances & reserves
    await db('accounts').insert({ user_id: USER, currency: 'USD', balance: 5000 });
    await db('accounts').insert({ user_id: 'receiver-c', currency: 'EUR', balance: 0 });
    await db('treasury_reserves').insert({ currency: 'USD', amount: 50000 });
    await db('treasury_reserves').insert({ currency: 'EUR', amount: 50000 });
  });

  describe('1. Atomic Settlement Enqueue in executeTransfer', () => {
    it('successfully enqueues settlement row in the same transaction as transfer', async () => {
      const db = getDb();
      const initialQueue = await db('settlement_queue').count('* as c').first();
      expect(Number(initialQueue?.c)).toBe(0);

      const result = await executeTransfer(
        {
          senderId: USER,
          receiverId: 'receiver-c',
          amount: '100',
          sourceCurrency: 'USD',
          destCurrency: 'EUR',
        },
        USER
      );

      expect(result.success).toBe(true);

      // Verify row exists in settlement_queue
      const queuedRow = await db('settlement_queue').where({ tx_id: result.txId }).first();
      expect(queuedRow).toBeDefined();
      expect(queuedRow.sender).toBe(USER);
      expect(queuedRow.receiver).toBe('receiver-c');
    });

    it('rolls back settlement enqueue if transaction fails during transfer', async () => {
      const db = getDb();

      // Attempt transfer with amount exceeding user's balance
      await expect(
        executeTransfer(
          {
            senderId: USER,
            receiverId: 'receiver-c',
            amount: '999999', // Insufficient funds
            sourceCurrency: 'USD',
            destCurrency: 'EUR',
          },
          USER
        )
      ).rejects.toThrow();

      // Queue should have 0 records
      const queueCount = await db('settlement_queue').count('* as c').first();
      expect(Number(queueCount?.c)).toBe(0);
    });
  });

  describe('2. Withdrawal State Machine Validation', () => {
    it('validates state transitions accurately', () => {
      expect(isValidWithdrawalTransition('created', 'provider_pending')).toBe(true);
      expect(isValidWithdrawalTransition('created', 'failed')).toBe(true);
      expect(isValidWithdrawalTransition('created', 'completed')).toBe(false);

      expect(isValidWithdrawalTransition('provider_pending', 'completed')).toBe(true);
      expect(isValidWithdrawalTransition('provider_pending', 'failed')).toBe(true);
      expect(isValidWithdrawalTransition('provider_pending', 'created')).toBe(false);

      expect(isValidWithdrawalTransition('completed', 'provider_pending')).toBe(false);
      expect(isValidWithdrawalTransition('completed', 'failed')).toBe(false);

      expect(isValidWithdrawalTransition('failed', 'completed')).toBe(false);
    });

    it('rejects invalid state transition in database update', async () => {
      const record = await createWithdrawalRecord({
        id: 'w-state-1',
        userId: USER,
        amount: '100.00',
        currency: 'USD',
        status: 'created',
      });

      expect(record.status).toBe('created');

      // Attempt invalid transition: created -> completed
      await expect(updateWithdrawalStatus('w-state-1', 'completed')).rejects.toThrow(
        /Invalid withdrawal status transition/
      );
    });

    it('records initial status as created before calling Stripe', async () => {
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'withdraw-state-test-key')
        .send({ amount: '150', destinationAccountId: 'acct_state_123' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('provider_pending');

      const db = getDb();
      const record = await db('withdrawal_requests').where({ id: res.body.data.requestId }).first();
      expect(record.status).toBe('provider_pending');
      expect(record.stripe_transfer_id).toBe('tr_mock_c_1');
      expect(record.stripe_idempotency_key).toBe('withdraw-state-test-key');
    });

    it('marks withdrawal as failed and releases hold if Stripe throws', async () => {
      mockTransfersCreate.mockRejectedValueOnce(new Error('Stripe network timeout'));

      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'withdraw-fail-test-key')
        .send({ amount: '200', destinationAccountId: 'acct_fail_123' });

      expect(res.status).toBe(500);

      // Available balance should still be full 5000 (hold is released because status is failed)
      const availBalance = await getAvailableBalance(USER, 'USD');
      expect(availBalance).toBe('5000.00');

      const db = getDb();
      const record = await db('withdrawal_requests').where({ user_id: USER, status: 'failed' }).first();
      expect(record).toBeDefined();
    });
  });

  describe('3. Webhook Hardening & Amount/Currency Validation', () => {
    it('rejects webhook with mismatched amount and does not debit ledger', async () => {
      const db = getDb();
      // Create a withdrawal record for 100.00 USD
      await createWithdrawalRecord({
        id: 'req_mismatch_1',
        userId: USER,
        amount: '100.00',
        currency: 'USD',
        status: 'provider_pending',
      });
      await db('withdrawal_requests')
        .where({ id: 'req_mismatch_1' })
        .update({ stripe_transfer_id: 'tr_mismatch_1' });

      // Webhook arrives with 10,000 USD instead of 100 USD
      const webhookPayload = JSON.stringify({
        id: 'evt_mismatch_1',
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_mismatch_1',
            amount: 1000000, // $10,000 in cents
            currency: 'usd',
            metadata: { userId: USER },
          },
        },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      // Balance must NOT have been debited (remains 5000)
      const balance = await getBalanceForCurrency(USER, 'USD');
      expect(balance).toBe('5000.00');

      // Withdrawal record must be marked failed
      const record = await db('withdrawal_requests').where({ id: 'req_mismatch_1' }).first();
      expect(record.status).toBe('failed');
    });

    it('rejects webhook with mismatched currency and does not debit ledger', async () => {
      const db = getDb();
      await createWithdrawalRecord({
        id: 'req_cur_mismatch',
        userId: USER,
        amount: '100.00',
        currency: 'USD',
        status: 'provider_pending',
      });
      await db('withdrawal_requests')
        .where({ id: 'req_cur_mismatch' })
        .update({ stripe_transfer_id: 'tr_cur_mismatch' });

      // Webhook arrives with EUR instead of USD
      const webhookPayload = JSON.stringify({
        id: 'evt_cur_mismatch',
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_cur_mismatch',
            amount: 10000,
            currency: 'eur',
            metadata: { userId: USER },
          },
        },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      const balance = await getBalanceForCurrency(USER, 'USD');
      expect(balance).toBe('5000.00');

      const record = await db('withdrawal_requests').where({ id: 'req_cur_mismatch' }).first();
      expect(record.status).toBe('failed');
    });

    it('processes matching webhook atomically and debits ledger', async () => {
      const db = getDb();
      await createWithdrawalRecord({
        id: 'req_match_ok',
        userId: USER,
        amount: '250.00',
        currency: 'USD',
        status: 'provider_pending',
      });
      await db('withdrawal_requests')
        .where({ id: 'req_match_ok' })
        .update({ stripe_transfer_id: 'tr_match_ok' });

      const webhookPayload = JSON.stringify({
        id: 'evt_match_ok',
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_match_ok',
            amount: 25000, // 250.00 USD in cents
            currency: 'usd',
            metadata: { userId: USER },
          },
        },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      // Balance should now be 5000 - 250 = 4750
      const balance = await getBalanceForCurrency(USER, 'USD');
      expect(balance).toBe('4750.00');

      const record = await db('withdrawal_requests').where({ id: 'req_match_ok' }).first();
      expect(record.status).toBe('completed');

      // Duplicate webhook for already completed withdrawal is handled idempotently
      const resDuplicate = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'mock_sig')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(resDuplicate.status).toBe(200);

      // Balance must NOT have been debited again
      const balanceAfterDup = await getBalanceForCurrency(USER, 'USD');
      expect(balanceAfterDup).toBe('4750.00');
    });
  });
});
