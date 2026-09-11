// ============================================================
//  TREASURY MODULE — System Liquidity Pool
// ============================================================
//
//  CHANGE LOG (Phase 1 Hardening):
//  ─────────────────────────────────
//  - Replaced in-memory object with `treasury_reserves` PostgreSQL table.
//  - All functions now async, accept optional Knex `trx` parameter.
//  - Reserve reads use SELECT FOR UPDATE inside transactions.
//
//  CHANGE LOG (Phase 2 — Exact Decimal Arithmetic):
//  ─────────────────────────────────────────────────
//  - All monetary arithmetic now uses decimal.js via src/utils/money.ts.
//  - Values travel as strings between DB ↔ JS — no parseFloat on money.
// ============================================================

import { Knex } from 'knex';
import { Currency, TreasuryReserves } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';
import { InsufficientLiquidityError } from '../utils/errors';
import * as money from '../utils/money';

// ----------------------------
//  Helper
// ----------------------------

function reservesTable(trx?: Knex.Transaction) {
  const db = trx ?? getDb();
  return db('treasury_reserves');
}

// ----------------------------
//  Reserve Management
// ----------------------------

export async function getReserves(): Promise<TreasuryReserves> {
  const rows = await reservesTable().select('currency', 'amount');
  const reserves: TreasuryReserves = {};
  for (const row of rows) {
    reserves[row.currency] = String(row.amount);
  }
  return reserves;
}

export async function getReserve(currency: Currency, trx?: Knex.Transaction): Promise<string> {
  let query = reservesTable(trx)
    .where({ currency })
    .select('amount')
    .first();

  // Lock the row inside a transaction
  if (trx) {
    query = query.forUpdate();
  }

  const row = await query;
  return row ? String(row.amount) : money.ZERO;
}

export async function addReserve(
  currency: Currency,
  amount: string,
  trx?: Knex.Transaction
): Promise<void> {
  const current = await getReserve(currency, trx);
  const newTotal = money.add(current, amount);

  const existing = await reservesTable(trx).where({ currency }).first();
  if (existing) {
    await reservesTable(trx)
      .where({ currency })
      .update({ amount: newTotal, updated_at: new Date() });
  } else {
    await reservesTable(trx).insert({ currency, amount: newTotal });
  }

  logger.debug(`Treasury reserve added`, { currency, amount, newTotal });
}

export async function deductReserve(
  currency: Currency,
  amount: string,
  trx?: Knex.Transaction
): Promise<void> {
  const current = await getReserve(currency, trx);
  if (money.lt(current, amount)) {
    throw new InsufficientLiquidityError(current, amount, currency);
  }
  const newTotal = money.sub(current, amount);
  await reservesTable(trx)
    .where({ currency })
    .update({ amount: newTotal, updated_at: new Date() });
}

// ----------------------------
//  Validation
// ----------------------------

export async function validateLiquidity(
  currency: Currency,
  amount: string,
  trx?: Knex.Transaction
): Promise<{
  valid: boolean;
  available: string;
  required: string;
  shortfall: string;
}> {
  const available = await getReserve(currency, trx);
  const valid = money.gte(available, amount);
  return {
    valid,
    available,
    required: amount,
    shortfall: valid ? money.ZERO : money.sub(amount, available),
  };
}

// ----------------------------
//  Seed Initial Reserves
// ----------------------------

export async function seedReserves(seeds: Partial<Record<Currency, number | string>>): Promise<void> {
  const db = getDb();
  for (const [currency, amount] of Object.entries(seeds)) {
    const amt = money.toMoneyString(amount ?? 0);
    const existing = await db('treasury_reserves').where({ currency }).first();
    if (existing) {
      await db('treasury_reserves').where({ currency }).update({ amount: amt, updated_at: new Date() });
    } else {
      await db('treasury_reserves').insert({ currency, amount: amt, updated_at: new Date() });
    }
    logger.info(`Treasury seeded: ${amt} ${currency}`);
  }
}
