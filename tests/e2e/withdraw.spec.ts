import { test } from '@playwright/test';

test.describe('Withdraw Workflow', () => {
  // NOTE: Withdraw workflow skipped because no Withdraw UI component or endpoint exists in the frontend/backend application.
  test.skip('withdraw funds to bank account', async () => {
    // Withdraw UI has not been implemented yet in the GlobalPay frontend.
  });
});
