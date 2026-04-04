// ============================================================
//  SETTLEMENT ENGINE ⭐ — Queue, Batching, Netting
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Transaction, BatchSummary, Currency } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  In-Memory Queue
// ----------------------------
const settlementQueue: Transaction[] = [];
let batchCounter = 0;

// ----------------------------
//  Enqueue
// ----------------------------

export function enqueue(tx: Transaction): void {
  settlementQueue.push(tx);
  logger.settle(`Transaction enqueued → queue size: ${settlementQueue.length}`, {
    txId: tx.txId,
    sender: tx.sender,
    receiver: tx.receiver,
  });
}

export function getQueueSize(): number {
  return settlementQueue.length;
}

export function getQueue(): Transaction[] {
  return [...settlementQueue];
}

// ----------------------------
//  Netting (Offset Optimizer)
// ----------------------------

interface NetPosition {
  [userId: string]: {
    [currency: string]: number; // positive = net owed, negative = net owes
  };
}

function computeNetting(transactions: Transaction[]): NetPosition {
  const positions: NetPosition = {};

  for (const tx of transactions) {
    // Debit sender
    if (!positions[tx.sender]) positions[tx.sender] = {};
    positions[tx.sender][tx.sourceCurrency] =
      (positions[tx.sender][tx.sourceCurrency] ?? 0) - tx.originalAmount;

    // Credit receiver
    if (!positions[tx.receiver]) positions[tx.receiver] = {};
    positions[tx.receiver][tx.destCurrency] =
      (positions[tx.receiver][tx.destCurrency] ?? 0) + tx.convertedAmount;
  }

  return positions;
}

// ----------------------------
//  Compute Total Volume
// ----------------------------

function computeVolume(transactions: Transaction[]): Record<string, number> {
  const volume: Record<string, number> = {};
  for (const tx of transactions) {
    const { sourceCurrency, originalAmount } = tx;
    volume[sourceCurrency] = parseFloat(
      ((volume[sourceCurrency] ?? 0) + originalAmount).toFixed(4)
    );
  }
  return volume;
}

// ----------------------------
//  Create Batch
// ----------------------------

export function createBatch(transactions: Transaction[]): BatchSummary {
  if (transactions.length === 0) {
    throw new Error('EMPTY_BATCH: Cannot create batch with zero transactions');
  }

  batchCounter++;
  const batchId = `BATCH-${Date.now()}-${uuidv4().split('-')[0].toUpperCase()}`;
  const totalVolume = computeVolume(transactions);
  const netting = computeNetting(transactions);

  const batch: BatchSummary = {
    batchId,
    transactionCount: transactions.length,
    totalVolume,
    transactions: [...transactions],
    timestamp: new Date(),
  };

  logger.settle(`Batch #${batchCounter} created`, {
    batchId,
    transactionCount: transactions.length,
    totalVolume,
    nettedPositions: Object.keys(netting).length,
  });

  return batch;
}

// ----------------------------
//  Flush Queue → Batch
// ----------------------------

export function flushQueue(): Transaction[] {
  const drained = [...settlementQueue];
  settlementQueue.length = 0;
  logger.settle(`Queue flushed → ${drained.length} transactions drained`);
  return drained;
}

// ----------------------------
//  Stats
// ----------------------------

export function getSettlementStats(): {
  queueSize: number;
  totalBatchesCreated: number;
} {
  return {
    queueSize: settlementQueue.length,
    totalBatchesCreated: batchCounter,
  };
}
