// ============================================================
//  SETTLEMENT ENGINE ⭐ — Queue, Batching, Netting (DB Persisted)
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Transaction, BatchSummary, Currency } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';

// ----------------------------
//  Row Mapper
// ----------------------------
function mapRowToTransaction(row: any): Transaction {
  return {
    txId: row.tx_id,
    sender: row.sender,
    receiver: row.receiver,
    originalAmount: Number(row.original_amount),
    convertedAmount: Number(row.converted_amount),
    sourceCurrency: row.source_currency as Currency,
    destCurrency: row.dest_currency as Currency,
    rate: Number(row.rate),
    complianceScore: Number(row.compliance_score),
    status: row.status,
    batchId: row.batch_id ?? undefined,
    timestamp: new Date(row.created_at),
  };
}

// ----------------------------
//  Enqueue (DB INSERT)
// ----------------------------
export async function enqueue(tx: Transaction): Promise<void> {
  const db = getDb();
  await db('settlement_queue').insert({
    id: uuidv4(),
    tx_id: tx.txId,
    sender: tx.sender,
    receiver: tx.receiver,
    original_amount: tx.originalAmount,
    converted_amount: tx.convertedAmount,
    source_currency: tx.sourceCurrency,
    dest_currency: tx.destCurrency,
    rate: tx.rate,
    compliance_score: tx.complianceScore,
    status: 'pending',
    batch_id: tx.batchId ?? null,
    created_at: tx.timestamp ? new Date(tx.timestamp) : new Date(),
  });

  const size = await getQueueSize();
  logger.settle(`Transaction enqueued → queue size: ${size}`, {
    txId: tx.txId,
    sender: tx.sender,
    receiver: tx.receiver,
  });
}

// ----------------------------
//  Queue Size & Inspection
// ----------------------------
export async function getQueueSize(): Promise<number> {
  const db = getDb();
  const res = await db('settlement_queue').where({ status: 'pending' }).count('* as c').first();
  return Number(res?.c ?? 0);
}

export async function getQueue(): Promise<Transaction[]> {
  const db = getDb();
  const rows = await db('settlement_queue').where({ status: 'pending' }).orderBy('created_at', 'asc');
  return rows.map(mapRowToTransaction);
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

  logger.settle(`Batch created`, {
    batchId,
    transactionCount: transactions.length,
    totalVolume,
    nettedPositions: Object.keys(netting).length,
  });

  return batch;
}

// ----------------------------
//  Flush Queue → Batch (Atomic UPDATE RETURNING)
// ----------------------------
export async function flushQueue(): Promise<Transaction[]> {
  const db = getDb();
  let rows: any[] = [];

  // Atomic UPDATE status='processing' returning * prevents race conditions between settlement runs
  try {
    rows = await db('settlement_queue')
      .where({ status: 'pending' })
      .update({
        status: 'processing',
        processed_at: new Date(),
      })
      .returning('*');
  } catch (err) {
    // Atomic SQLite query with RETURNING * syntax to eliminate race window
    const rawRes = await db.raw(
      `UPDATE settlement_queue SET status = 'processing', processed_at = ? WHERE status = 'pending' RETURNING *`,
      [new Date().toISOString()]
    );
    rows = Array.isArray(rawRes) ? rawRes : (rawRes?.rows ?? rawRes ?? []);
  }

  const drained = rows.map(mapRowToTransaction);
  logger.settle(`Queue flushed → ${drained.length} transactions drained`);
  return drained;
}

// ----------------------------
//  Stats
// ----------------------------
export async function getSettlementStats(): Promise<{
  queueSize: number;
  totalBatchesCreated: number;
}> {
  const db = getDb();
  const queueRes = await db('settlement_queue').where({ status: 'pending' }).count('* as c').first();
  const batchRes = await db('settlement_batches').count('* as c').first();

  return {
    queueSize: Number(queueRes?.c ?? 0),
    totalBatchesCreated: Number(batchRes?.c ?? 0),
  };
}
