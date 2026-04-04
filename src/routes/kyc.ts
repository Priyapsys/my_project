// ============================================================
//  ROUTE: POST /api/kyc/verify
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { submitKyc, getKycRecord } from '../middleware/kyc';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/kyc/verify
router.post('/verify', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.userId!;

  try {
    const record = submitKyc(userId);
    logger.success(`KYC submitted and verified`, { userId });

    res.status(200).json({
      success: true,
      data: {
        userId,
        status: record.status,
        verifiedAt: record.verifiedAt?.toISOString(),
        message: 'KYC verified. You may now perform transactions.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KYC verification failed';
    res.status(500).json({
      success: false,
      error: message,
      code: 'KYC_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/kyc/status
router.get('/status', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.userId!;
  const record = getKycRecord(userId);

  res.status(200).json({
    success: true,
    data: {
      userId,
      status: record?.status ?? 'not_submitted',
      verifiedAt: record?.verifiedAt?.toISOString() ?? null,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
