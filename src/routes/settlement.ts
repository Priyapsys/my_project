// ============================================================
//  ROUTE: POST /api/settlement/run  |  GET /api/settlement/status
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { runSettlement } from '../services/settlementService';
import { getSettlementStats } from '../modules/settlement';
import { getChainStats, getAllRecords } from '../modules/blockchain';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/settlement/run — trigger batch settlement
router.post('/run', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await runSettlement();

    res.status(200).json({
      success: true,
      data: {
        batchId:          result.batchId,
        txHash:           result.txHash,
        transactionCount: result.transactionCount,
        totalVolume:      result.totalVolume,
        timestamp:        result.timestamp,
        message: 'Settlement batch successfully anchored to blockchain.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Settlement failed';
    logger.error(`Settlement run failed`, { error: message });

    const isEmpty = message.includes('EMPTY_QUEUE');
    res.status(isEmpty ? 400 : 500).json({
      success: false,
      error: message,
      code: isEmpty ? 'EMPTY_QUEUE' : 'SETTLEMENT_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/settlement/status — queue + chain stats
router.get('/status', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const settlementStats = getSettlementStats();
  const chainStats = getChainStats();

  res.status(200).json({
    success: true,
    data: {
      queue: settlementStats,
      blockchain: chainStats,
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/settlement/history — all blockchain records
router.get('/history', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const records = getAllRecords();

  res.status(200).json({
    success: true,
    data: {
      count: records.length,
      batches: records.map((r) => ({
        batchId:          r.batchId,
        txHash:           r.txHash,
        transactionCount: r.batch.transactionCount,
        totalVolume:      r.batch.totalVolume,
        anchoredAt:       r.anchoredAt.toISOString(),
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
