import { test, expect } from './fixtures';

test.describe('Deposit Workflow', () => {
  test.beforeEach(async ({ resetDatabase }) => {
    await resetDatabase();
  });

  test('creates a deposit intent via POST /api/deposit', async ({ request }) => {
    const userId = 'alice';

    // Seed user with KYC
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 1000 }, kycVerified: true },
    });

    // Obtain JWT
    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    // POST /api/deposit
    const depositRes = await request.post('http://localhost:3000/api/deposit', {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 250, currency: 'USD' },
    });

    const body = await depositRes.json();

    // If Stripe key is not configured, we expect a 500 with a clear error
    // If Stripe key IS configured, we expect a 200 with clientSecret
    if (depositRes.ok()) {
      expect(body.success).toBe(true);
      expect(body.data.clientSecret).toBeTruthy();
      expect(body.data.paymentIntentId).toBeTruthy();
      expect(body.data.paymentIntentId).toMatch(/^pi_/);
    } else {
      // Stripe key not set — verify the error is about configuration, not a crash
      expect(body.success).toBe(false);
      expect(body.error).toContain('STRIPE_TEST_KEY');
    }
  });

  test('rejects deposit with missing amount', async ({ request }) => {
    const userId = 'alice';

    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 1000 }, kycVerified: true },
    });

    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    const depositRes = await request.post('http://localhost:3000/api/deposit', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currency: 'USD' },
    });

    expect(depositRes.status()).toBe(400);
    const body = await depositRes.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION');
  });

  test('rejects deposit without authentication', async ({ request }) => {
    const depositRes = await request.post('http://localhost:3000/api/deposit', {
      data: { amount: 100, currency: 'USD' },
    });

    expect(depositRes.status()).toBe(401);
  });
});
