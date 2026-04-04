// ============================================================
//  ROUTE: GET /api/balance/:userId
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getBalance, getLedgerSnapshot } from '../modules/ledger';
import { AuthenticatedRequest } from '../utils/types';

const router = Router();

// GET /api/balance/:userId
router.get('/:userId', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({
      success: false,
      error: 'userId parameter is required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const balances = getBalance(userId);

  res.status(200).json({
    success: true,
    data: {
      userId,
      balances,
      currencies: Object.keys(balances),
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/balance — all users (admin/debug)
router.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const snapshot = getLedgerSnapshot();

  res.status(200).json({
    success: true,
    data: {
      totalUsers: Object.keys(snapshot).length,
      balances: snapshot,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
