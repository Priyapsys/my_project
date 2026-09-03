import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';

let token: string;
const USER = 'concurrent-user';

beforeAll(async () => {
  try { await initDatabase(); } catch(e) {}
  token = issueToken(USER);
  await seedKycVerified([USER]);
});

afterAll(async () => {
  try { await closeDatabase(); } catch(e) {}
});

beforeEach(async () => {
  try {
    const db = getDb();
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
  it('should handle concurrent requests safely with SELECT FOR UPDATE', async () => {
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
          destCurrency: 'GBP'
        });
    });

    const responses = await Promise.all(requests);

    const successCount = responses.filter(r => r.status === 200).length;
    const failCount = responses.filter(r => r.status === 400 && r.body.code === 'INSUFFICIENT_FUNDS').length;

    expect(successCount).toBe(5);
    expect(failCount).toBe(5);

    // Final balance should be exactly 0
    const db = getDb();
    const balanceRow = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(balanceRow.balance)).toBe(0);
  });
});
