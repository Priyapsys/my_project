// ============================================================
//  TEST HELPER ROUTE — Only active when NODE_ENV !== 'production'
// ============================================================

import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import { setBalance } from '../modules/ledger';
import { seedReserves } from '../modules/treasury';
import { seedKycVerified } from '../modules/kyc';
import { ensureUser } from '../modules/users';
import * as money from '../utils/money';

const router = Router();

// Safety guard: NEVER expose in production
router.use((_req: Request, res: Response, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  next();
});

/**
 * POST /api/test/reset
 * Clear DB tables and re-seed treasury reserves for fresh test runs.
 */
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    await db('idempotency_keys').del();
    await db('accounts').del();
    await db('transactions').del();
    await db('treasury_reserves').del();
    await db('settlement_batches').del();
    await db('settlement_queue').del();
    await db('kyc_records').del();
    await db('withdrawal_requests').del();
    await db('processed_webhooks').del();

    await seedReserves({
      USD: 1_000_000,
      INR: 50_000_000,
      GBP: 500_000,
      EUR: 800_000,
      AED: 2_000_000,
      JPY: 80_000_000,
    });

    res.status(200).json({ success: true, message: 'State reset complete' });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/test/seed-user
 * Seed a user with custom balances and verified KYC status.
 */
router.post('/seed-user', async (req: Request, res: Response) => {
  try {
    const { userId, balances, kycVerified = true } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    await ensureUser(userId, process.env.TEST_USER_PASSWORD ?? 'TestPassword123!', 'user');

    if (kycVerified) {
      await seedKycVerified([userId]);
    }

    if (balances && typeof balances === 'object') {
      for (const [cur, amt] of Object.entries(balances)) {
        await setBalance(userId, cur as import('../utils/types').Currency, money.toMoneyString(String(amt)));
      }
    }

    res.status(200).json({ success: true, userId });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
