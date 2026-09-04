// ============================================================
//  ROUTE: POST /api/deposit — Create Stripe Deposit Intent
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createDepositIntent, BankIntegrationError } from '../modules/bankIntegration';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/deposit — initiate a deposit via Stripe PaymentIntent
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, currency } = req.body || {};
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

    if (!currency || typeof currency !== 'string') {
      res.status(400).json({
        success: false,
        error: 'currency is required',
        code: 'VALIDATION',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── Create PaymentIntent ──────────────────────────────────
    const result = await createDepositIntent(userId, amount, currency);

    logger.info('Deposit intent created', { userId, amount, currency, paymentIntentId: result.paymentIntentId });

    res.status(200).json({
      success: true,
      data: {
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deposit failed';
    const code = err instanceof BankIntegrationError ? err.code : 'DEPOSIT_ERROR';
    logger.error('Deposit failed', { error: message, userId: req.userId });

    res.status(500).json({
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
