import { test, expect } from './fixtures';

test.describe('Blockchain Settlement Engine Flow', () => {
  test.beforeEach(async ({ resetDatabase }) => {
    await resetDatabase();
  });

  test('executes settlement batch, anchors proof on-chain, and displays verified settlement status card', async ({
    loginAs,
    request,
  }) => {
    const sender = 'alice';
    const recipient = 'bob';

    // 1. Seed users and balances
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId: sender, balances: { USD: 5000 }, kycVerified: true },
    });
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: { userId: recipient, balances: { INR: 100000 }, kycVerified: true },
    });

    // Obtain sender JWT token for API calls
    const loginRes = await request.post('http://localhost:3000/api/login', {
      data: { userId: sender },
    });
    const { token } = (await loginRes.json()).data;

    // 2. Perform 2 transfers to add transactions to the settlement queue
    await request.post('http://localhost:3000/api/transfer', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'e2e-settle-tx-1',
      },
      data: {
        senderId: sender,
        receiverId: recipient,
        amount: 100,
        sourceCurrency: 'USD',
        destCurrency: 'INR',
      },
    });

    await request.post('http://localhost:3000/api/transfer', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'e2e-settle-tx-2',
      },
      data: {
        senderId: sender,
        receiverId: recipient,
        amount: 150,
        sourceCurrency: 'USD',
        destCurrency: 'INR',
      },
    });

    // 3. Log in as Alice and navigate to Settlement tab
    const page = await loginAs(sender);
    await page.getByTestId('nav-tab-settlement').click();

    await expect(page.getByTestId('settlement-hero')).toBeVisible();

    // Assert pending queue count is 2
    await expect(page.getByTestId('settlement-queue-size')).toHaveText('2');

    // 4. Click Run Settlement button
    await page.getByTestId('run-settlement-button').click();

    // 5. Assert latest settlement card appears with VERIFIED status
    await expect(page.getByTestId('latest-settlement-section')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('settlement-status-badge')).toContainText('VERIFIED');
    await expect(page.getByTestId('latest-settlement-section').getByTestId('settlement-batch-id')).not.toBeEmpty();

    // Assert link to Solana blockchain proof is rendered
    await expect(page.getByTestId('latest-settlement-section').getByTestId('view-proof-button')).toBeVisible();
    await expect(page.getByTestId('latest-settlement-section').getByTestId('view-proof-button')).toHaveAttribute('href', /solana\.com/);

    // 6. Confirm pending queue size resets to 0
    await expect(page.getByTestId('settlement-queue-size')).toHaveText('0');
  });
});
