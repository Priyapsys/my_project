import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';

let token: string;
const USER = 'integrity-user';

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
    
    // User has plenty of balance
    await db('accounts').insert({ user_id: USER, currency: 'USD', balance: 10000 });
    
    // Deliberately set Treasury EUR to 0 to cause a failure AFTER FX but BEFORE transaction completes
    await db('treasury_reserves').insert({ currency: 'USD', amount: 50000 });
    await db('treasury_reserves').insert({ currency: 'EUR', amount: 0 }); // Empty!
  } catch (err) {}
});

describe('Transactional Integrity', () => {
  it('should rollback sender debit if treasury validation fails', async () => {
    const db = getDb();
    
    // Capture balance before
    const beforeBalance = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(beforeBalance.balance)).toBe(10000);

    const res = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-integrity-1')
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: '1000',
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    // Should fail due to insufficient liquidity (treasury has 0 EUR)
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_LIQUIDITY');

    // Verify balance was rolled back (not debited)
    const afterBalance = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(afterBalance.balance)).toBe(10000); // Should remain 10000, not 9000

    // Verify no transaction record was stored
    const txCount = await db('transactions').count('* as c').first();
    expect(Number(txCount?.c)).toBe(0);
  });
});
