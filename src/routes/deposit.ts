// ============================================================
//  ROUTE: POST /api/deposit — Create Stripe Deposit Intent
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { depositSchema } from '../schemas';
import { createDepositIntent, BankIntegrationError } from '../modules/bankIntegration';
import { credit } from '../modules/ledger';
import { AuthenticatedRequest, Currency } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/deposit — initiate a deposit via Stripe PaymentIntent (or direct credit in demo mode)
router.post(
  '/',
  authMiddleware,
  validateBody(depositSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { amount, currency } = req.body;
      const userId = req.userId!;

      // ── Demo Mode Guard (Bypasses Stripe & directly credits ledger in non-production) ──
      const isDemoRequested =
        req.query.demo === 'true' || req.body?.demo === true ||
        process.env.DEMO_MODE === 'true';

      if (isDemoRequested) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('Demo deposit blocked: demo mode is disabled in production', {
            userId,
            ip: req.ip,
          });
          res.status(403).json({
            success: false,
            error: 'Demo mode is disabled in production',
            code: 'DEMO_MODE_DISABLED',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const upperCur = currency.toUpperCase() as Currency;
        await credit(userId, upperCur, amount);
        const paymentIntentId = `pi_demo_${Date.now()}`;

        logger.info('Demo deposit directly credited to ledger', {
          userId,
          amount,
          currency: upperCur,
          paymentIntentId,
        });

        res.status(200).json({
          success: true,
          data: {
            demo: true,
            credited: true,
            userId,
            amount,
            currency: upperCur,
            paymentIntentId,
          },
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
  }
);

export default router;
