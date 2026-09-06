import { test, expect } from './fixtures';

test.describe('Withdraw Workflow', () => {
  test.beforeEach(async ({ resetDatabase }) => {
    await resetDatabase();
  });

  test('creates a withdrawal via POST /api/withdraw', async ({ request }) => {
    const userId = 'alice';

    // Seed user with USD balance
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 5000 }, kycVerified: true },
    });

    // Obtain JWT
    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    // POST /api/withdraw
    const withdrawRes = await request.post('http://localhost:3000/api/withdraw', {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 100, destinationAccountId: 'acct_test_destination_123' },
    });

    const body = await withdrawRes.json();

    expect(withdrawRes.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.transferId).toBeTruthy();
    expect(body.data.transferId).toMatch(/^tr_/);
    expect(body.data.status).toBe('pending');
  });

  test('rejects withdrawal with insufficient balance', async ({ request }) => {
    const userId = 'alice';

    // Seed user with only 50 USD
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 50 }, kycVerified: true },
    });

    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    const withdrawRes = await request.post('http://localhost:3000/api/withdraw', {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 1000, destinationAccountId: 'acct_test_destination_123' },
    });

    expect(withdrawRes.status()).toBe(400);
    const body = await withdrawRes.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
  });

  test('rejects withdrawal with missing destinationAccountId', async ({ request }) => {
    const userId = 'alice';

    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId, balances: { USD: 1000 }, kycVerified: true },
    });

    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId },
    });
    const { token } = (await loginRes.json()).data;

    const withdrawRes = await request.post('http://localhost:3000/api/withdraw', {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 100 },
    });

    expect(withdrawRes.status()).toBe(400);
    const body = await withdrawRes.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION');
  });

  test('rejects withdrawal without authentication', async ({ request }) => {
    const withdrawRes = await request.post('http://localhost:3000/api/withdraw', {
      data: { amount: 100, destinationAccountId: 'acct_test_123' },
    });

    expect(withdrawRes.status()).toBe(401);
  });
});
