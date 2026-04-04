// ============================================================
//  LEDGER MODULE ⭐ — Source of Truth for Balances & History
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Currency, CurrencyBalances, Transaction } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  In-Memory Stores
// ----------------------------
const balanceStore = new Map<string, CurrencyBalances>();
const transactionStore = new Map<string, Transaction[]>();

// ----------------------------
//  Balance Operations
// ----------------------------

export function getBalance(userId: string): CurrencyBalances {
  return balanceStore.get(userId) ?? {};
}

export function getBalanceForCurrency(userId: string, currency: Currency): number {
  const balances = getBalance(userId);
  return balances[currency] ?? 0;
}

export function setBalance(userId: string, currency: Currency, amount: number): void {
  const balances = balanceStore.get(userId) ?? {};
  balances[currency] = parseFloat(amount.toFixed(4));
  balanceStore.set(userId, balances);
}

export function updateBalance(userId: string, currency: Currency, delta: number): number {
  const current = getBalanceForCurrency(userId, currency);
  const updated = parseFloat((current + delta).toFixed(4));
  setBalance(userId, currency, updated);
  logger.debug(`Ledger balance updated`, { userId, currency, delta, newBalance: updated });
  return updated;
}

export function debit(userId: string, currency: Currency, amount: number): void {
  const current = getBalanceForCurrency(userId, currency);
  if (current < amount) {
    throw new Error(`Insufficient balance: ${userId} has ${current} ${currency}, needs ${amount}`);
  }
  updateBalance(userId, currency, -amount);
}

export function credit(userId: string, currency: Currency, amount: number): void {
  updateBalance(userId, currency, amount);
}

// ----------------------------
//  Transaction History
// ----------------------------

export function storeTransaction(tx: Transaction): void {
  // Index by sender
  const senderTxs = transactionStore.get(tx.sender) ?? [];
  senderTxs.push(tx);
  transactionStore.set(tx.sender, senderTxs);

  // Index by receiver (separate slice)
  if (tx.receiver !== tx.sender) {
    const receiverTxs = transactionStore.get(tx.receiver) ?? [];
    receiverTxs.push(tx);
    transactionStore.set(tx.receiver, receiverTxs);
  }
}

export function getTransactions(userId: string): Transaction[] {
  return transactionStore.get(userId) ?? [];
}

export function updateTransactionBatch(txId: string, batchId: string): void {
  transactionStore.forEach((txList) => {
    txList.forEach((tx) => {
      if (tx.txId === txId) {
        tx.batchId = batchId;
      }
    });
  });
}

// ----------------------------
//  Seed Initial Balances
// ----------------------------

export function seedBalances(seeds: Array<{ userId: string; currency: Currency; amount: number }>): void {
  for (const { userId, currency, amount } of seeds) {
    setBalance(userId, currency, amount);
    logger.info(`Seeded balance: ${userId} → ${amount} ${currency}`);
  }
}

// ----------------------------
//  Debug Snapshot
// ----------------------------

export function getLedgerSnapshot(): Record<string, CurrencyBalances> {
  const snapshot: Record<string, CurrencyBalances> = {};
  balanceStore.forEach((balances, userId) => {
    snapshot[userId] = { ...balances };
  });
  return snapshot;
}

export function createTransactionId(): string {
  return `TX-${Date.now()}-${uuidv4().split('-')[0].toUpperCase()}`;
}
