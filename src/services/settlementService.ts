// ============================================================
//  SETTLEMENT SERVICE — Batch Creation + Blockchain Anchoring
// ============================================================
//
//  NOTE (Phase 1): This module is largely unchanged. The only
//  modification is `await`ing the now-async `updateTransactionBatch`.
//  The settlement queue itself remains in-memory.
//  FLAG: The settlement queue should be persisted in a future pass
//  so unsettled transactions survive server restarts.
// ============================================================

import { BatchSummary } from '../utils/types';
import { logger } from '../utils/logger';
import { flushQueue, createBatch, getQueueSize } from '../modules/settlement';
import { hashBatchData, sendBatchToBlockchain } from './blockchainService';
import { updateTransactionBatch, storeSettlementBatch, updateSettlementBatchStatus } from '../modules/ledger';

export interface SettlementRunResult {
  batchId: string;
  txHash: string | null;
  batchHash: string;
  explorerUrl: string | null;
  transactionCount: number;
  totalVolume: Record<string, string>;
  timestamp: string;
}

// ----------------------------
//  Run Settlement Cycle
// ----------------------------

export async function runSettlement(): Promise<SettlementRunResult> {
  const queueSize = await getQueueSize();

  logger.separator();
  logger.settle(`Settlement run triggered`, { queueSize });

  if (queueSize === 0) {
    throw new Error('EMPTY_QUEUE: No transactions waiting for settlement');
  }

  // ── Step 1: Drain queue ────────────────────────────────────
  const transactions = await flushQueue();
  logger.settle(`Drained ${transactions.length} transactions from queue`);

  // ── Step 2: Create batch ───────────────────────────────────
  const batch: BatchSummary = createBatch(transactions);

  // ── Step 3: Compute Hash and Store Pending Batch ──────────
  const batchHash = hashBatchData(batch);
  await storeSettlementBatch(batch.batchId, batchHash, 'pending');

  // ── Step 4: Tag transactions with batchId in ledger ───────
  for (const tx of transactions) {
    await updateTransactionBatch(tx.txId, batch.batchId);
  }
  logger.settle(`Tagged ${transactions.length} transactions with batchId: ${batch.batchId}`);

  // ── Step 5: Anchor to blockchain with retries ──────────────
  let proof;
  try {
    proof = await sendBatchToBlockchain(batch.batchId, batchHash);
    await updateSettlementBatchStatus(batch.batchId, 'confirmed', proof.txHash, new Date());
  } catch (error) {
    // If anchoring fails, we leave it in pending/failed state.
    await updateSettlementBatchStatus(batch.batchId, 'failed');
    logger.error(`Settlement anchor failed. Batch ${batch.batchId} left in failed state for reconciliation.`);
    throw error;
  }

  // ── Step 6: Attach hash to batch record ────────────────────
  batch.blockchainTxHash = proof.txHash;

  logger.success(`Settlement complete`, {
    batchId: batch.batchId,
    txHash: proof.txHash,
    batchHash: batchHash,
    explorerUrl: proof.explorerUrl,
    transactionCount: batch.transactionCount,
    totalVolume: batch.totalVolume,
  });
  logger.separator();

  return {
    batchId: batch.batchId,
    txHash: proof.txHash,
    batchHash: batchHash,
    explorerUrl: proof.explorerUrl,
    transactionCount: batch.transactionCount,
    totalVolume: batch.totalVolume,
    timestamp: batch.timestamp.toISOString(),
  };
}
