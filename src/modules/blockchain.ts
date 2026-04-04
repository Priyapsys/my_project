// ============================================================
//  BLOCKCHAIN MODULE (MOCK) — Immutable Settlement Anchor
// ============================================================

import { BatchSummary, BlockchainRecord } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  Immutable On-Chain Store
// ----------------------------
const blockchainStore = new Map<string, BlockchainRecord>();
let totalAnchored = 0;

// ----------------------------
//  Hash Generator
// ----------------------------

function generateTxHash(): string {
  const timestamp = Date.now().toString(16).toUpperCase();
  const randomHex = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `0x${timestamp}${randomHex}`;
}

// ----------------------------
//  Store Batch on Chain
// ----------------------------

export function storeBatch(batch: BatchSummary): BlockchainRecord {
  const txHash = generateTxHash();
  const anchoredAt = new Date();

  const record: BlockchainRecord = {
    batchId: batch.batchId,
    txHash,
    anchoredAt,
    batch,
  };

  // Immutable: once written, cannot be overwritten
  if (blockchainStore.has(batch.batchId)) {
    logger.warn(`Blockchain: batch already anchored`, { batchId: batch.batchId });
    return blockchainStore.get(batch.batchId)!;
  }

  blockchainStore.set(batch.batchId, record);
  totalAnchored++;

  logger.chain(`Batch anchored to blockchain`, {
    batchId: batch.batchId,
    txHash,
    transactionCount: batch.transactionCount,
    totalVolume: batch.totalVolume,
    anchoredAt: anchoredAt.toISOString(),
  });

  return record;
}

// ----------------------------
//  Query
// ----------------------------

export function getBatchRecord(batchId: string): BlockchainRecord | undefined {
  return blockchainStore.get(batchId);
}

export function getAllRecords(): BlockchainRecord[] {
  return Array.from(blockchainStore.values());
}

export function getChainStats(): {
  totalBatchesAnchored: number;
  totalTransactionsAnchored: number;
} {
  let totalTxs = 0;
  blockchainStore.forEach((r) => {
    totalTxs += r.batch.transactionCount;
  });
  return {
    totalBatchesAnchored: totalAnchored,
    totalTransactionsAnchored: totalTxs,
  };
}
