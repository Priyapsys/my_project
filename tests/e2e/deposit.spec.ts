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

    expect(depositRes.status()).toBe(200);
    const body = await depositRes.json();
    expect(body.success).toBe(true);
    expect(body.data.clientSecret).toBeTruthy();
    expect(body.data.paymentIntentId).toBeTruthy();
    expect(body.data.paymentIntentId).toMatch(/^pi_/);
  });

  test('creates a direct deposit in demo mode via POST /api/deposit?demo=true', async ({ request }) => {
    const userId = 'alice';

    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 1000 }, kycVerified: true },
    });

    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    const depositRes = await request.post('http://localhost:3000/api/deposit?demo=true', {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 500, currency: 'USD' },
    });

    expect(depositRes.status()).toBe(200);
    const body = await depositRes.json();
    expect(body.success).toBe(true);
    expect(body.data.demo).toBe(true);
    expect(body.data.credited).toBe(true);
    expect(body.data.amount).toBe(500);
    expect(body.data.currency).toBe('USD');

    // Verify ledger balance was directly updated
    const balanceRes = await request.get(`http://localhost:3000/api/balance/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balanceBody = await balanceRes.json();
    expect(balanceBody.data.balances.USD).toBe(1500);
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
