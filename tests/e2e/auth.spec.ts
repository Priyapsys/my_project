import { test, expect } from './fixtures';

test.describe('Authentication & Onboarding Flow', () => {
  test.beforeEach(async ({ resetDatabase }) => {
    await resetDatabase();
  });

  test('completes full signup, KYC, logout, login, and session validation flow', async ({ page }) => {
    const newUserId = `user_${Date.now()}`;
    const password = 'SignupPassword123!';

    // 1. Visit App & Sign up / Log in as new user
    await page.goto('/');
    await expect(page.getByTestId('login-user-id-input')).toBeVisible();

    await page.getByTestId('auth-mode-toggle').click();
    await page.getByTestId('login-user-id-input').fill(newUserId);
    await page.getByTestId('login-password-input').fill(password);
    await page.getByTestId('login-submit-button').click();

    // 2. Progressive KYC Verification
    // Step 1: ID Document
    await expect(page.getByTestId('kyc-id-number-input')).toBeVisible();
    await page.getByTestId('kyc-id-number-input').fill('DOC-99887766');
    await page.getByTestId('kyc-step1-submit-button').click();

    // Step 2: Address Proof
    await expect(page.getByTestId('kyc-address-input')).toBeVisible();
    await page.getByTestId('kyc-address-input').fill('456 Financial Way, Suite 100');
    await page.getByTestId('kyc-step2-submit-button').click();

    // Step 3: Face Liveness Check
    await expect(page.getByTestId('kyc-liveness-button')).toBeVisible();
    await page.getByTestId('kyc-liveness-button').click();
    await page.getByTestId('kyc-step3-submit-button').click();

    // Verify KYC completed banner and transition to Dashboard
    await expect(page.getByTestId('kyc-done-banner')).toBeVisible();
    await expect(page.getByTestId('dashboard-layout')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('user-name')).toHaveText(newUserId);

    // 3. Logout
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login-user-id-input')).toBeVisible();

    // 4. Log back in (should skip KYC since user is now VERIFIED)
    await page.getByTestId('login-user-id-input').fill(newUserId);
    await page.getByTestId('login-password-input').fill(password);
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('dashboard-layout')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText(newUserId);
  });

  test('redirects to login when JWT is missing or invalid', async ({ page }) => {
    // 1. Missing token / empty localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('login-user-id-input')).toBeVisible();

    // 2. Invalid / expired JWT token
    await page.evaluate(() => {
      localStorage.setItem(
        'globalpay_session',
        JSON.stringify({ userId: 'alice', token: 'invalid.expired.jwt' })
      );
    });
    await page.goto('/');
    await expect(page.getByTestId('login-user-id-input')).toBeVisible();
  });
});
