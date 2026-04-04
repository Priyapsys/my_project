// ============================================================
//  ROUTE: POST /api/transfer
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { kycMiddleware } from '../middleware/kyc';
import { executeTransfer } from '../services/transactionService';
import { AuthenticatedRequest, TransferRequestBody } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

router.post(
  '/',
  authMiddleware,
  kycMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as TransferRequestBody;
      const result = await executeTransfer(body, req.userId!);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed';
      logger.error(`Transfer failed`, { error: message, userId: req.userId });

      const code = message.split(':')[0] ?? 'TRANSFER_ERROR';
      const statusMap: Record<string, number> = {
        COMPLIANCE_BLOCKED:      403,
        KYC_REQUIRED:            403,
        AUTH_MISMATCH:           403,
        INSUFFICIENT_FUNDS:      400,
        INSUFFICIENT_LIQUIDITY:  400,
        VALIDATION:              400,
        FX_UNSUPPORTED:          400,
      };

      res.status(statusMap[code] ?? 500).json({
        success: false,
        error: message,
        code,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
