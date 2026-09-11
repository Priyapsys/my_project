// ============================================================
//  API GATEWAY LAYER — Integration Tests
// ============================================================

import request from 'supertest';
import app from '../../src/server';
import { issueToken } from '../../src/middleware/auth';
import { initDatabase, closeDatabase, getDb } from '../../src/db/connection';
import { seedKycVerified } from '../../src/modules/kyc';
import { ensureUser } from '../../src/modules/users';

let token: string;
const TEST_USER = 'gateway-user';

beforeAll(async () => {
  try {
    await initDatabase();
  } catch (e) {}
  token = issueToken(TEST_USER);
  await seedKycVerified([TEST_USER, 'bob']);
  await ensureUser(TEST_USER, 'TestPassword123!', 'admin');
});

afterAll(async () => {
  try {
    await closeDatabase();
  } catch (e) {}
});

beforeEach(async () => {
  try {
    const db = getDb();
    await db('accounts').del();
    await db('treasury_reserves').del();
    await db('settlement_queue').del();
    await db('accounts').insert({ user_id: TEST_USER, currency: 'USD', balance: 5000 });
    await db('treasury_reserves').insert({ currency: 'EUR', amount: 50000 });
  } catch (e) {}
});

describe('API Gateway: Correlation IDs', () => {
  it('generates a new UUID X-Request-Id header when none is provided', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    const reqId = res.headers['x-request-id'];
    expect(reqId).toBeDefined();
    // Verify standard UUID format
    expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('echoes back provided X-Request-Id and attaches it to request logs', async () => {
    const customId = 'trace-id-custom-987654321';
    const logSpy = jest.spyOn(console, 'log');

    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customId);

    // Verify customId was printed in console output
    const loggedCalls = logSpy.mock.calls.map((args) => args.join(' '));
    const matched = loggedCalls.some((line) => line.includes(customId));
    logSpy.mockRestore();

    expect(matched).toBe(true);
  });
});

describe('API Gateway: Security Headers (Helmet)', () => {
  it('returns baseline security headers on responses', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });
});

describe('API Gateway: CORS Whitelisting', () => {
  it('allows request from an allowed origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects request from a non-allowed origin with 403', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-attacker-site.com');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CORS_ERROR');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles preflight OPTIONS requests for allowed origin', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('API Gateway: Zod Request Validation', () => {
  describe('POST /api/auth/login', () => {
    it('rejects invalid login payload (missing userId)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ userId: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('accepts valid login payload', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ userId: 'validuser' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('rejects nonexistent user with password using timing-safe credential verification', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ userId: 'nonexistent_user_9999', password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/auth/signup', () => {
    it('rejects invalid signup payload (invalid email)', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ userId: 'newuser', email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('accepts valid signup payload', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ userId: `user_${Date.now()}`, email: 'newuser@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });
  });

  describe('POST /api/transfer', () => {
    it('rejects invalid transfer payload (negative amount & self-transfer)', async () => {
      const res = await request(app)
        .post('/api/transfer')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `gw-val-tx-${Date.now()}`)
        .send({
          senderId: TEST_USER,
          receiverId: TEST_USER,
          amount: -50,
          sourceCurrency: 'USD',
          destCurrency: 'EUR',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('accepts valid transfer shape', async () => {
      const res = await request(app)
        .post('/api/transfer')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `gw-val-tx-ok-${Date.now()}`)
        .send({
          senderId: TEST_USER,
          receiverId: 'bob',
          amount: 25,
          sourceCurrency: 'USD',
          destCurrency: 'EUR',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/deposit', () => {
    it('rejects invalid deposit payload (missing amount)', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('accepts valid deposit payload in demo mode', async () => {
      const res = await request(app)
        .post('/api/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 150, currency: 'USD', demo: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.credited).toBe(true);
    });
  });

  describe('POST /api/withdraw', () => {
    it('rejects invalid withdraw payload (missing destinationAccountId)', async () => {
      const res = await request(app)
        .post('/api/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });
  });

  describe('POST /api/settlement/run', () => {
    it('rejects invalid settlement run payload (invalid batchSize type)', async () => {
      const res = await request(app)
        .post('/api/settlement/run')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `gw-val-settle-${Date.now()}`)
        .send({ batchSize: -10 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('accepts valid empty payload for settlement run (returns 400 EMPTY_QUEUE if empty)', async () => {
      const res = await request(app)
        .post('/api/settlement/run')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `gw-val-settle-ok-${Date.now()}`)
        .send({});

      // Passes schema validation; fails on business logic because queue is empty
      expect(res.body.code).not.toBe('VALIDATION');
      expect([200, 400]).toContain(res.status);
    });
  });
});

describe('API Gateway: Rate Limiting', () => {
  describe('Auth Rate Limiter & Independence', () => {
    it('returns 429 when exceeding login rate limit and leaves transfer limiter unaffected', async () => {
      const uniqueIp = '192.168.10.50';

      // 1. Fire 5 login requests with x-test-rate-limit to reach limit of 5 req/min
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', uniqueIp)
          .set('x-test-rate-limit', 'true')
          .send({ userId: 'alice' });
        expect(res.status).toBe(200);
      }

      // 2. 6th login request from same IP must be rate-limited with 429
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', uniqueIp)
        .set('x-test-rate-limit', 'true')
        .send({ userId: 'alice' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.code).toBe('RATE_LIMITED');
      expect(blockedRes.body.error).toContain('authentication attempts');

      // 3. Verify transfer limiter is INDEPENDENT and NOT blocked
      const transferRes = await request(app)
        .post('/api/transfer')
        .set('X-Forwarded-For', uniqueIp)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `gw-rate-indep-${Date.now()}`)
        .set('x-test-rate-limit', 'true')
        .send({
          senderId: TEST_USER,
          receiverId: 'bob',
          amount: 10,
          sourceCurrency: 'USD',
          destCurrency: 'EUR',
        });

      // Transfer endpoint succeeds, proving auth limiter does not cascade to transfers
      expect(transferRes.status).toBe(200);
      expect(transferRes.body.success).toBe(true);
    });
  });

  describe('Global Rate Limiter', () => {
    it('applies baseline rate limiting to routes with no other limiter', async () => {
      const uniqueIp = '192.168.20.75';

      // Global limiter has max 100 requests per window
      // Send 100 requests to /health
      for (let i = 0; i < 100; i++) {
        const res = await request(app)
          .get('/health')
          .set('X-Forwarded-For', uniqueIp)
          .set('x-test-rate-limit', 'true');
        expect(res.status).toBe(200);
      }

      // 101st request from same IP must be rate-limited
      const blockedRes = await request(app)
        .get('/health')
        .set('X-Forwarded-For', uniqueIp)
        .set('x-test-rate-limit', 'true');

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.code).toBe('RATE_LIMITED');
    });
  });
});
