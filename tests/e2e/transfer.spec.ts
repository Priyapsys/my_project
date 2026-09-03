import { test, expect } from './fixtures';

test.describe('Cross-Border Money Transfer Flow', () => {
  test.beforeEach(async ({ resetDatabase }) => {
    await resetDatabase();
  });

  test('executes cross-currency transfer, verifies sender balance deduction and recipient balance increase', async ({
    loginAs,
    request,
  }) => {
    const sender = 'alice';
    const recipient = 'bob';
    const transferAmount = 250;

    // Seed sender with $1,000 USD and recipient with 500,000 INR
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: {
        userId: sender,
        balances: { USD: 1000, GBP: 100 },
        kycVerified: true,
      },
    });
    await request.post('http://localhost:3000/api/test/seed-user', {
      data: {
        userId: recipient,
        balances: { INR: 500000, USD: 100 },
        kycVerified: true,
      },
    });

    // 1. Log in as Alice (Sender)
    const page = await loginAs(sender);

    // Verify initial USD balance on overview
    await expect(page.getByTestId('balance-amount-USD')).toContainText('$1,000.00');

    // 2. Navigate to Send Money tab
    await page.getByTestId('nav-tab-send').click();
    await expect(page.getByTestId('transfer-receiver-input')).toBeVisible();

    // 3. Fill out transfer form
    await page.getByTestId('transfer-receiver-input').fill(recipient);
    await page.getByTestId('transfer-amount-input').fill(String(transferAmount));
    await page.getByTestId('transfer-source-currency-select').selectOption('USD');
    await page.getByTestId('transfer-dest-currency-select').selectOption('INR');

    // Verify FX rate preview appears
    await expect(page.getByTestId('transfer-fx-preview')).toBeVisible();

    // 4. Submit transfer
    await page.getByTestId('transfer-submit-button').click();

    // 5. Assert success response and transaction ID
    await expect(page.getByTestId('transfer-success-box')).toBeVisible();
    await expect(page.getByTestId('transfer-tx-id')).not.toBeEmpty();

    // 6. Navigate back to Overview and verify deducted sender balance ($1,000 - $250 = $750)
    await page.getByTestId('nav-tab-overview').click();
    await expect(page.getByTestId('balance-amount-USD')).toContainText('$750.00');

    // 7. Log in as Bob (Recipient) and verify updated INR balance
    const recipientPage = await loginAs(recipient);
    await expect(recipientPage.getByTestId('balance-card')).toBeVisible();
    // 500,000 INR + (250 USD * 83.5 FX rate = 20,875 INR) = 520,875 INR
    await expect(recipientPage.getByTestId('balance-amount-INR')).toContainText('₹520,875.00');
  });
});
