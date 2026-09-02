// ============================================================
//  ROUTE: POST /api/transfer
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { kycMiddleware } from '../middleware/kyc';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { executeTransfer } from '../services/transactionService';
import { AuthenticatedRequest, TransferRequestBody } from '../utils/types';
import { DomainError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

router.post(
  '/',
  authMiddleware,
  kycMiddleware,
  idempotencyMiddleware,
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

      // Use typed error code if available, fall back to string parsing
      const code = err instanceof DomainError
        ? err.code
        : (message.split(':')[0] ?? 'TRANSFER_ERROR');

      const statusMap: Record<string, number> = {
        COMPLIANCE_BLOCKED:      403,
        KYC_REQUIRED:            403,
        AUTH_MISMATCH:           403,
        INSUFFICIENT_FUNDS:      400,
        INSUFFICIENT_LIQUIDITY:  400,
        VALIDATION:              400,
        FX_ERROR:                400,
        LEDGER_WRITE_ERROR:      500,
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
