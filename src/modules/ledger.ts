// ============================================================
//  LEDGER MODULE ⭐ — Source of Truth for Balances & History
// ============================================================
//
//  CHANGE LOG (Phase 1 Hardening):
//  ─────────────────────────────────
//  - Replaced in-memory Maps with PostgreSQL tables (accounts, transactions).
//  - All write functions accept an optional Knex `trx` parameter so callers
//    can enlist them in a broader database transaction.
//  - All functions are now async (BREAKING — callers must await).
//  - Balance reads use SELECT FOR UPDATE when inside a transaction to
//    prevent concurrent stale-balance reads.
//  - Public interface (function names + parameter shapes) is preserved.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Knex } from 'knex';
import { Currency, CurrencyBalances, Transaction } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';
import { InsufficientBalanceError, LedgerWriteError, ConcurrentUpdateError } from '../utils/errors';

// ----------------------------
//  Helper: get query builder, optionally scoped to a transaction
// ----------------------------

function accountsTable(trx?: Knex.Transaction) {
  const db = trx ?? getDb();
  return db('accounts');
}

function transactionsTable(trx?: Knex.Transaction) {
  const db = trx ?? getDb();
  return db('transactions');
}

// ----------------------------
//  Balance Operations
// ----------------------------

export async function getBalance(userId: string, trx?: Knex.Transaction): Promise<CurrencyBalances> {
  const rows = await accountsTable(trx)
    .where({ user_id: userId })
    .select('currency', 'balance');

  const balances: CurrencyBalances = {};
  for (const row of rows) {
    balances[row.currency as Currency] = parseFloat(row.balance);
  }
  return balances;
}

export async function getBalanceForCurrency(
  userId: string,
  currency: Currency,
  trx?: Knex.Transaction
): Promise<number> {
  let query = accountsTable(trx)
    .where({ user_id: userId, currency })
    .select('balance')
    .first();

  // When inside a transaction, lock the row to prevent concurrent reads
  if (trx) {
    query = query.forUpdate();
  }

  const row = await query;
  return row ? parseFloat(row.balance) : 0;
}

export async function setBalance(
  userId: string,
  currency: Currency,
  amount: number,
  trx?: Knex.Transaction,
  expectedVersion?: number
): Promise<void> {
  const rounded = parseFloat(amount.toFixed(4));
  const table = accountsTable(trx);

  // Upsert: insert or update
  const existing = await table
    .where({ user_id: userId, currency })
    .first();

  if (existing) {
    const versionToMatch = expectedVersion !== undefined ? expectedVersion : Number(existing.version);
    const updated = await accountsTable(trx)
      .where({ user_id: userId, currency, version: versionToMatch })
      .update({
        balance: rounded,
        version: versionToMatch + 1,
        updated_at: new Date(),
      });

    if (updated === 0) {
      throw new ConcurrentUpdateError(`Concurrent update detected for user ${userId} currency ${currency}`);
    }
  } else {
    await table.insert({
      user_id: userId,
      currency,
      balance: rounded,
      version: 1,
    });
  }
}

export async function updateBalance(
  userId: string,
  currency: Currency,
  delta: number,
  trx?: Knex.Transaction
): Promise<number> {
  const current = await getBalanceForCurrency(userId, currency, trx);
  const updated = parseFloat((current + delta).toFixed(4));
  await setBalance(userId, currency, updated, trx);
  logger.debug(`Ledger balance updated`, { userId, currency, delta, newBalance: updated });
  return updated;
}

export async function getPendingWithdrawalHolds(
  userId: string,
  currency: Currency,
  trx?: Knex.Transaction,
  excludeRequestId?: string
): Promise<number> {
  const db = trx ?? getDb();
  let query = db('withdrawal_requests')
    .where({ user_id: userId, currency, status: 'pending' });

  if (excludeRequestId) {
    query = query.whereNot({ id: excludeRequestId });
  }

  const row = await query.sum('amount as totalHold').first();
  return row && row.totalHold ? parseFloat(String(row.totalHold)) : 0;
}

export async function getAvailableBalance(
  userId: string,
  currency: Currency,
  trx?: Knex.Transaction,
  excludeRequestId?: string
): Promise<number> {
  const total = await getBalanceForCurrency(userId, currency, trx);
  const hold = await getPendingWithdrawalHolds(userId, currency, trx, excludeRequestId);
  return Math.max(0, parseFloat((total - hold).toFixed(4)));
}

export async function debit(
  userId: string,
  currency: Currency,
  amount: number,
  trx?: Knex.Transaction,
  excludeRequestId?: string
): Promise<void> {
  // getAvailableBalance acquires FOR UPDATE lock via getBalanceForCurrency when trx is provided
  const available = await getAvailableBalance(userId, currency, trx, excludeRequestId);
  if (available < amount) {
    throw new InsufficientBalanceError(userId, available, amount, currency);
  }
  await updateBalance(userId, currency, -amount, trx);
}

export async function credit(
  userId: string,
  currency: Currency,
  amount: number,
  trx?: Knex.Transaction
): Promise<void> {
  await updateBalance(userId, currency, amount, trx);
}

// ----------------------------
//  Transaction History
// ----------------------------

export async function storeTransaction(tx: Transaction, trx?: Knex.Transaction): Promise<void> {
  try {
    await transactionsTable(trx).insert({
      tx_id: tx.txId,
      sender: tx.sender,
      receiver: tx.receiver,
      original_amount: tx.originalAmount,
      converted_amount: tx.convertedAmount,
      source_currency: tx.sourceCurrency,
      dest_currency: tx.destCurrency,
      rate: tx.rate,
      compliance_score: tx.complianceScore,
      status: tx.status,
      batch_id: tx.batchId ?? null,
      created_at: tx.timestamp,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LedgerWriteError(`Failed to store transaction ${tx.txId}: ${message}`);
  }
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const rows = await transactionsTable()
    .where(function () {
      this.where('sender', userId).orWhere('receiver', userId);
    })
    .orderBy('created_at', 'desc')
    .select('*');

  return rows.map(rowToTransaction);
}

export async function updateTransactionBatch(txId: string, batchId: string): Promise<void> {
  await transactionsTable()
    .where({ tx_id: txId })
    .update({ batch_id: batchId });
}

// ----------------------------
//  Settlement Batches
// ----------------------------

export async function storeSettlementBatch(
  batchId: string,
  batchHash: string,
  status: 'pending' | 'anchored' | 'confirmed' | 'failed' = 'pending',
  txHash: string | null = null,
  trx?: Knex.Transaction
): Promise<void> {
  const db = trx ?? getDb();
  await db('settlement_batches').insert({
    batch_id: batchId,
    batch_hash: batchHash,
    status,
    tx_hash: txHash,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

export async function updateSettlementBatchStatus(
  batchId: string,
  status: 'pending' | 'anchored' | 'confirmed' | 'failed',
  txHash: string | null = null,
  confirmedAt: Date | null = null,
  trx?: Knex.Transaction
): Promise<void> {
  const db = trx ?? getDb();
  const updateData: any = { status, updated_at: new Date() };
  if (txHash) updateData.tx_hash = txHash;
  if (confirmedAt) updateData.confirmed_at = confirmedAt;

  await db('settlement_batches').where({ batch_id: batchId }).update(updateData);
}

export async function getSettlementBatch(batchId: string): Promise<any> {
  const db = getDb();
  return db('settlement_batches').where({ batch_id: batchId }).first();
}

export async function getPendingSettlementBatches(): Promise<any[]> {
  const db = getDb();
  return db('settlement_batches').where({ status: 'pending' }).select('*');
}

export async function getAllSettlementBatches(): Promise<any[]> {
  const db = getDb();
  return db('settlement_batches').orderBy('created_at', 'desc').select('*');
}


// ----------------------------
//  Seed Initial Balances
// ----------------------------

export async function seedBalances(
  seeds: Array<{ userId: string; currency: Currency; amount: number }>
): Promise<void> {
  for (const { userId, currency, amount } of seeds) {
    await setBalance(userId, currency, amount);
    logger.info(`Seeded balance: ${userId} → ${amount} ${currency}`);
  }
}

// ----------------------------
//  Debug Snapshot
// ----------------------------

export async function getLedgerSnapshot(): Promise<Record<string, CurrencyBalances>> {
  const rows = await accountsTable()
    .select('user_id', 'currency', 'balance')
    .orderBy('user_id');

  const snapshot: Record<string, CurrencyBalances> = {};
  for (const row of rows) {
    if (!snapshot[row.user_id]) snapshot[row.user_id] = {};
    snapshot[row.user_id][row.currency as Currency] = parseFloat(row.balance);
  }
  return snapshot;
}

export function createTransactionId(): string {
  return `TX-${Date.now()}-${uuidv4().split('-')[0].toUpperCase()}`;
}

// ----------------------------
//  Row → Domain Mapper
// ----------------------------

function rowToTransaction(row: any): Transaction {
  return {
    txId: row.tx_id,
    sender: row.sender,
    receiver: row.receiver,
    originalAmount: parseFloat(row.original_amount),
    convertedAmount: parseFloat(row.converted_amount),
    sourceCurrency: row.source_currency as Currency,
    destCurrency: row.dest_currency as Currency,
    rate: parseFloat(row.rate),
    complianceScore: row.compliance_score,
    status: row.status,
    batchId: row.batch_id ?? undefined,
    timestamp: new Date(row.created_at),
  };
}
