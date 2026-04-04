// ============================================================
//  ROUTE: GET /api/transactions/:userId
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getTransactions } from '../modules/ledger';
import { AuthenticatedRequest } from '../utils/types';

const router = Router();

// GET /api/transactions/:userId
router.get('/:userId', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const { userId } = req.params;
  const { limit, status } = req.query;

  if (!userId) {
    res.status(400).json({
      success: false,
      error: 'userId parameter is required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  let txs = getTransactions(userId);

  // Optional filter by status
  if (status && typeof status === 'string') {
    txs = txs.filter((tx) => tx.status === status);
  }

  // Optional limit
  const limitNum = limit ? parseInt(limit as string, 10) : undefined;
  if (limitNum && !isNaN(limitNum)) {
    txs = txs.slice(-limitNum); // most recent N
  }

  // Sort by newest first
  const sorted = [...txs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  res.status(200).json({
    success: true,
    data: {
      userId,
      count: sorted.length,
      transactions: sorted.map((tx) => ({
        txId:             tx.txId,
        sender:           tx.sender,
        receiver:         tx.receiver,
        originalAmount:   tx.originalAmount,
        convertedAmount:  tx.convertedAmount,
        sourceCurrency:   tx.sourceCurrency,
        destCurrency:     tx.destCurrency,
        rate:             tx.rate,
        complianceScore:  tx.complianceScore,
        status:           tx.status,
        batchId:          tx.batchId ?? null,
        timestamp:        tx.timestamp,
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
