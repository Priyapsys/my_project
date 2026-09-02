// ============================================================
//  ROUTE: POST /api/settlement/run  |  GET /api/settlement/status
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { runSettlement } from '../services/settlementService';
import { getSettlementStats } from '../modules/settlement';
import { getChainStats, getAllRecords, verifyBatchOnChain, hashBatchData } from '../services/blockchainService';
import { AuthenticatedRequest } from '../utils/types';
import { getSettlementBatch } from '../modules/ledger';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/settlement/run — trigger batch settlement
router.post('/run', authMiddleware, idempotencyMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await runSettlement();

    res.status(200).json({
      success: true,
      data: {
        batchId:          result.batchId,
        txHash:           result.txHash,
        batchHash:        result.batchHash,
        status:           result.txHash ? 'VERIFIED' : 'PENDING',
        settlementLabel:  result.txHash ? 'Settlement Secured' : 'Awaiting Confirmation',
        explorerUrl:      result.explorerUrl ?? (result.txHash ? `https://explorer.solana.com/tx/${result.txHash}?cluster=devnet` : null),
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
        batchHash:        r.batchHash,
        status:           r.txHash ? 'VERIFIED' : 'PENDING',
        transactionCount: r.batch.transactionCount,
        totalVolume:      r.batch.totalVolume,
        anchoredAt:       r.anchoredAt.toISOString(),
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/settlement/:batchId/verify — verify on-chain memo
router.get('/:batchId/verify', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;
    const batch = await getSettlementBatch(batchId);
    
    if (!batch) {
      res.status(404).json({ success: false, error: 'Batch not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }
    
    const isValid = await verifyBatchOnChain(batchId, batch.batch_hash);
    
    res.status(200).json({
      success: true,
      data: {
        batchId,
        batchHash: batch.batch_hash,
        txHash: batch.tx_hash,
        verified: isValid,
        message: isValid ? 'Batch signature matches on-chain record.' : 'Batch signature verification failed.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    res.status(500).json({
      success: false,
      error: message,
      code: 'VERIFY_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/settlement/reconcile — reconcile pending batches
router.post('/reconcile', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { reconcilePendingBatches } = await import('../services/blockchainService');
    const result = await reconcilePendingBatches();
    
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation failed';
    res.status(500).json({
      success: false,
      error: message,
      code: 'RECONCILE_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
