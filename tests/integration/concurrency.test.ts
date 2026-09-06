import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';
import { getAvailableBalance } from '../../src/modules/ledger';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_test_conc', client_secret: 'pi_test_conc_secret' }),
    },
    transfers: {
      create: jest.fn().mockResolvedValue({ id: 'tr_test_conc', object: 'transfer' }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

let token: string;
const USER = 'concurrent-user';

beforeAll(async () => {
  process.env.STRIPE_TEST_KEY = 'sk_test_mock_concurrency';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
  try {
    await initDatabase();
  } catch (e) {}
  token = issueToken(USER);
  await seedKycVerified([USER]);
});

afterAll(async () => {
  try {
    await closeDatabase();
  } catch (e) {}
});

beforeEach(async () => {
  try {
    const db = getDb();
    await db('withdrawal_requests').del();
    await db('idempotency_keys').del();
    await db('accounts').del();
    await db('transactions').del();
    await db('treasury_reserves').del();
    await db('settlement_queue').del();
    await db('kyc_records').del();

    // Re-seed KYC after clearing tables
    await seedKycVerified([USER]);

    // Setup balances
    await db('accounts').insert({ user_id: USER, currency: 'USD', balance: 1000 });
    await db('treasury_reserves').insert({ currency: 'USD', amount: 50000 });
    await db('treasury_reserves').insert({ currency: 'GBP', amount: 50000 });
  } catch (err) {}
});

describe('Concurrency Safety', () => {
  it('should handle concurrent transfer requests safely with SELECT FOR UPDATE', async () => {
    // We send 10 concurrent requests for 200 USD each.
    // Starting balance is 1000 USD.
    // Exactly 5 should succeed, and 5 should fail with INSUFFICIENT_FUNDS.

    const requests = Array.from({ length: 10 }).map((_, idx) => {
      return request(app)
        .post('/api/transfer')
        .set('Authorization', `Bearer ${token}`)
        // Crucial: unique idempotency key for each request!
        .set('Idempotency-Key', `concurrent-key-${idx}`)
        .send({
          senderId: USER,
          receiverId: 'bob',
          amount: 200,
          sourceCurrency: 'USD',
          destCurrency: 'GBP',
        });
    });

    const responses = await Promise.all(requests);

    const successCount = responses.filter((r) => r.status === 200).length;
    const failCount = responses.filter(
      (r) => r.status === 400 && r.body.code === 'INSUFFICIENT_FUNDS'
    ).length;

    expect(successCount).toBe(5);
    expect(failCount).toBe(5);

    // Final balance should be exactly 0
    const db = getDb();
    const balanceRow = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(balanceRow.balance)).toBe(0);
  });

  it('should handle concurrent withdrawal requests safely using holds with SELECT FOR UPDATE', async () => {
    // We send 10 concurrent withdrawal requests for 200 USD each.
    // Starting balance is 1000 USD.
    // Exactly 5 should succeed (placing holds), and 5 should fail with INSUFFICIENT_FUNDS.

    const requests = Array.from({ length: 10 }).map(() => {
      return request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 200,
          destinationAccountId: 'acct_conc_123',
        });
    });

    const responses = await Promise.all(requests);

    const successCount = responses.filter((r) => r.status === 200).length;
    const failCount = responses.filter(
      (r) => r.status === 400 && r.body.code === 'INSUFFICIENT_FUNDS'
    ).length;

    expect(successCount).toBe(5);
    expect(failCount).toBe(5);

    // Raw balance is still 1000 USD (debit not executed until webhook), but available balance is 0 USD
    const db = getDb();
    const balanceRow = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(balanceRow.balance)).toBe(1000);

    const availBalance = await getAvailableBalance(USER, 'USD');
    expect(availBalance).toBe(0);
  });
});
