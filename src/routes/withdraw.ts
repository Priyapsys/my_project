// ============================================================
//  ROUTE: POST /api/withdraw — Withdraw Funds via Stripe Transfer
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { processWithdrawal, BankIntegrationError } from '../modules/bankIntegration';
import { debit } from '../modules/ledger';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';
import { DomainError } from '../utils/errors';

const router = Router();

// POST /api/withdraw — debit internal ledger then create Stripe Transfer
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, destinationAccountId } = req.body || {};
    const userId = req.userId!;

    // ── Validation ────────────────────────────────────────────
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'amount is required and must be a positive number',
        code: 'VALIDATION',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!destinationAccountId || typeof destinationAccountId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'destinationAccountId is required',
        code: 'VALIDATION',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── Debit Internal Ledger First ───────────────────────────
    // This ensures the user has sufficient balance before initiating Stripe Transfer
    await debit(userId, 'USD', amount);
    logger.info('Withdrawal ledger debit succeeded', { userId, amount });

    // ── Create Stripe Transfer ────────────────────────────────
    const result = await processWithdrawal(userId, amount, destinationAccountId);

    logger.info('Withdrawal Transfer created', { userId, amount, transferId: result.transferId });

    res.status(200).json({
      success: true,
      data: {
        transferId: result.transferId,
        status: result.status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Withdrawal failed';
    const code = err instanceof DomainError ? err.code : 'WITHDRAWAL_ERROR';
    const statusCode = code === 'INSUFFICIENT_FUNDS' ? 400 : 500;

    logger.error('Withdrawal failed', { error: message, userId: req.userId });

    res.status(statusCode).json({
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
