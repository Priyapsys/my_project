// ============================================================
//  ROUTE: POST /api/login
// ============================================================

import { Router, Request, Response } from 'express';
import { issueToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getKycRecord, setKycStatus } from '../middleware/kyc';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'userId is required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const cleanUserId = userId.trim().toLowerCase();
  
  const existingKyc = await getKycRecord(cleanUserId);
  if (!existingKyc) {
    await setKycStatus(cleanUserId, 'PENDING');
  }
  
  const token = issueToken(cleanUserId);

  logger.info(`Login: JWT issued`, { userId: cleanUserId });

  res.status(200).json({
    success: true,
    data: {
      userId: cleanUserId,
      token,
      message: 'Login successful. Use this token as: Authorization: Bearer <token>',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
