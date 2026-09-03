import { test } from '@playwright/test';

test.describe('Deposit Workflow', () => {
  // NOTE: Deposit workflow skipped because no Deposit UI component or endpoint exists in the frontend/backend application.
  test.skip('deposit funds via payment gateway', async () => {
    // Deposit UI has not been implemented yet in the GlobalPay frontend.
  });
});
