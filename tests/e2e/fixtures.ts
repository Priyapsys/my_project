import { test as base, Page } from '@playwright/test';

type CustomFixtures = {
  authenticatedPage: Page;
  loginAs: (userId: string, options?: { balances?: Record<string, number> }) => Promise<Page>;
  resetDatabase: () => Promise<void>;
};

export const test = base.extend<CustomFixtures>({
  resetDatabase: [async ({ request }, use) => {
    const reset = async () => {
      const res = await request.post('http://localhost:3000/api/test/reset');
      if (!res.ok()) {
        console.warn('Database reset failed:', await res.text());
      }
    };
    await use(reset);
  }, { auto: false }],

  loginAs: async ({ page, request }, use) => {
    const loginUser = async (userId: string, options?: { balances?: Record<string, number> }) => {
      // 1. Seed user in backend (sets KYC verified and optional balances)
      await request.post('http://localhost:3000/api/test/seed-user', {
        data: {
          userId,
          balances: options?.balances,
          kycVerified: true,
        },
      });

      // 2. Obtain real JWT from backend login endpoint
      const seedUsers = ['alice', 'bob', 'charlie', 'diana', 'eve'];
      const password = seedUsers.includes(userId)
        ? (process.env.SEED_USER_PASSWORD ?? 'DemoPassword123!')
        : (process.env.TEST_USER_PASSWORD ?? 'TestPassword123!');
      const response = await request.post('http://localhost:3000/api/login', {
        data: { userId, password },
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(`Login failed for ${userId}: ${data.error}`);
      }

      // 3. Inject JWT session into browser localStorage
      await page.addInitScript((session) => {
        window.localStorage.setItem('globalpay_session', JSON.stringify(session));
      }, { userId: data.data.userId, token: data.data.token });

      await page.goto('/');
      await page.waitForSelector('[data-testid="dashboard-layout"]');
      return page;
    };

    await use(loginUser);
  },

  authenticatedPage: async ({ loginAs }, use) => {
    const page = await loginAs('alice');
    await use(page);
  },
});

export { expect } from '@playwright/test';
