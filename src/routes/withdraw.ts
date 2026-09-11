// ============================================================
//  ROUTE: POST /api/withdraw — Withdraw Funds via Stripe Transfer
// ============================================================

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { withdrawSchema } from '../schemas';
import {
  processWithdrawal,
  BankIntegrationError,
  createWithdrawalRecord,
  updateWithdrawalStripeTransferId,
  updateWithdrawalStatus,
  getWithdrawalRecordById,
  getUserWithdrawalRecords,
} from '../modules/bankIntegration';
import { getAvailableBalance } from '../modules/ledger';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';
import { DomainError, InsufficientBalanceError } from '../utils/errors';
import { getDb } from '../db/connection';

const router = Router();

// POST /api/withdraw — Place hold on internal ledger balance then create Stripe Transfer
router.post(
  '/',
  authMiddleware,
  validateBody(withdrawSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    let requestId: string | null = null;
    try {
      const { amount, destinationAccountId } = req.body;
      const userId = req.userId!;

    // ── Hold Approach (Reserved-Balance Mechanism) ───────────
    // WE CHOSE THE HOLD APPROACH: Rather than debiting user ledger immediately,
    // we validate available balance and create a `withdrawal_requests` record with
    // status `pending`. This places a hold on the user's available balance
    // (available balance = total balance - sum of pending holds).
    // Final ledger debit happens ONLY once confirmed via `transfer.paid` webhook
    // (matching the deposit flow pattern). If the Stripe call or transfer fails,
    // status is set to `failed` which releases the hold without requiring compensating debits.

    const db = getDb();
    requestId = uuidv4();

    // Check available balance and create pending request atomically inside a transaction
    await db.transaction(async (trx) => {
      const available = await getAvailableBalance(userId, 'USD', trx);
      if (available < amount) {
        throw new InsufficientBalanceError(userId, available, amount, 'USD');
      }

      await createWithdrawalRecord(
        {
          id: requestId!,
          userId,
          amount,
          currency: 'USD',
          status: 'pending',
        },
        trx
      );
    });

    logger.info('Withdrawal hold placed', { userId, amount, requestId });

    // ── Create Stripe Transfer ────────────────────────────────
    let result;
    try {
      result = await processWithdrawal(userId, amount, destinationAccountId);
      await updateWithdrawalStripeTransferId(requestId, result.transferId);
    } catch (stripeErr) {
      // If Stripe transfer creation fails, mark withdrawal request as failed to release hold
      await updateWithdrawalStatus(requestId, 'failed');
      throw stripeErr;
    }

    logger.info('Withdrawal Transfer created', { userId, amount, transferId: result.transferId, requestId });

    res.status(200).json({
      success: true,
      data: {
        requestId,
        transferId: result.transferId,
        status: 'pending',
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

// GET /api/withdraw — list user's withdrawal requests
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const records = await getUserWithdrawalRecords(userId);

    res.status(200).json({
      success: true,
      data: records,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch withdrawal requests';
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/withdraw/:id — fetch status of a specific withdrawal request
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const record = await getWithdrawalRecordById(id);

    if (!record) {
      res.status(404).json({
        success: false,
        error: 'Withdrawal request not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (record.user_id !== userId) {
      // Return 404 rather than 403 to avoid exposing whether another user's ID exists.
      res.status(404).json({
        success: false,
        error: 'Withdrawal request not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: record,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch withdrawal status';
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
