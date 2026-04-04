// ============================================================
//  ROUTE: POST /api/login
// ============================================================

import { Router, Request, Response } from 'express';
import { issueToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.post('/', (req: Request, res: Response): void => {
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
  const token = issueToken(cleanUserId);

  logger.info(`Login: token issued`, { userId: cleanUserId });

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
