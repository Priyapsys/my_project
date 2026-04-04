// ============================================================
//  SETTLEMENT SERVICE — Batch Creation + Blockchain Anchoring
// ============================================================

import { BatchSummary, BlockchainRecord } from '../utils/types';
import { logger } from '../utils/logger';
import { flushQueue, createBatch, getQueueSize } from '../modules/settlement';
import { storeBatch } from '../modules/blockchain';
import { updateTransactionBatch } from '../modules/ledger';

export interface SettlementRunResult {
  batchId: string;
  txHash: string;
  transactionCount: number;
  totalVolume: Record<string, number>;
  timestamp: string;
}

// ----------------------------
//  Run Settlement Cycle
// ----------------------------

export async function runSettlement(): Promise<SettlementRunResult> {
  const queueSize = getQueueSize();

  logger.separator();
  logger.settle(`Settlement run triggered`, { queueSize });

  if (queueSize === 0) {
    throw new Error('EMPTY_QUEUE: No transactions waiting for settlement');
  }

  // ── Step 1: Drain queue ────────────────────────────────────
  const transactions = flushQueue();
  logger.settle(`Drained ${transactions.length} transactions from queue`);

  // ── Step 2: Create batch ───────────────────────────────────
  const batch: BatchSummary = createBatch(transactions);

  // ── Step 3: Anchor to blockchain ──────────────────────────
  const chainRecord: BlockchainRecord = storeBatch(batch);

  // ── Step 4: Tag transactions with batchId in ledger ───────
  for (const tx of transactions) {
    updateTransactionBatch(tx.txId, batch.batchId);
  }
  logger.settle(`Tagged ${transactions.length} transactions with batchId: ${batch.batchId}`);

  // ── Step 5: Attach hash to batch record ────────────────────
  batch.blockchainTxHash = chainRecord.txHash;

  logger.success(`Settlement complete`, {
    batchId: batch.batchId,
    txHash: chainRecord.txHash,
    transactionCount: batch.transactionCount,
    totalVolume: batch.totalVolume,
  });
  logger.separator();

  return {
    batchId: batch.batchId,
    txHash: chainRecord.txHash,
    transactionCount: batch.transactionCount,
    totalVolume: batch.totalVolume,
    timestamp: batch.timestamp.toISOString(),
  };
}
