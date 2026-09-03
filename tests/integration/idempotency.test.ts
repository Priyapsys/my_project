import request from 'supertest';
import app from '../../src/server';
import { getDb, initDatabase, closeDatabase } from '../../src/db/connection';
import { issueToken } from '../../src/middleware/auth';
import { seedKycVerified } from '../../src/modules/kyc';

let token: string;
const USER = 'idemp-user';

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
    
    // Setup balances
    await db('accounts').insert({ user_id: USER, currency: 'USD', balance: 5000 });
    await db('treasury_reserves').insert({ currency: 'USD', amount: 5000 });
    await db('treasury_reserves').insert({ currency: 'EUR', amount: 5000 });
  } catch (err) {}
});

describe('Idempotency Middleware Integration', () => {
  it('should return 422 if Idempotency-Key header is missing', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 100,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('should process a valid request and cache the response', async () => {
    const key = 'test-key-1';
    
    // First request
    const res1 = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 100,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    const txId = res1.body.data.txId;

    // Second request with SAME key
    const res2 = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 100, // Even if body is identical, it skips processing
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    // Should be exactly the same response
    expect(res2.status).toBe(200);
    expect(res2.body.data.txId).toBe(txId); // Same transaction ID, no new transfer made
  });

  it('should process a new request if the key is different', async () => {
    const res1 = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-a')
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 100,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    const res2 = await request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-b') // Different key
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 100,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.txId).not.toBe(res2.body.data.txId);
  });

  it('should handle simultaneous parallel requests with the SAME key safely without double transfer', async () => {
    const key = 'simultaneous-race-key';

    const req1 = request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 500,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    const req2 = request(app)
      .post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        senderId: USER,
        receiverId: 'bob',
        amount: 500,
        sourceCurrency: 'USD',
        destCurrency: 'EUR'
      });

    const [res1, res2] = await Promise.all([req1, req2]);

    // One must succeed with 200, the other must either return 200 (cached via polling) or 409 CONFLICT
    const okResponses = [res1, res2].filter((r) => r.status === 200);
    expect(okResponses.length).toBeGreaterThanOrEqual(1);

    // Verify only ONE transaction record was created in the DB
    const db = getDb();
    const txCount = await db('transactions').count('* as c').first();
    expect(Number(txCount?.c)).toBe(1);

    // Sender balance should be 4500 (5000 - 500), NOT 4000
    const account = await db('accounts').where({ user_id: USER, currency: 'USD' }).first();
    expect(Number(account.balance)).toBe(4500);
  });
});
