// ============================================================
//  TREASURY MODULE — System Liquidity Pool
// ============================================================
//
//  CHANGE LOG (Phase 1 Hardening):
//  ─────────────────────────────────
//  - Replaced in-memory object with `treasury_reserves` PostgreSQL table.
//  - All functions now async, accept optional Knex `trx` parameter.
//  - Reserve reads use SELECT FOR UPDATE inside transactions.
// ============================================================

import { Knex } from 'knex';
import { Currency, TreasuryReserves } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';
import { InsufficientLiquidityError } from '../utils/errors';

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
    reserves[row.currency] = parseFloat(row.amount);
  }
  return reserves;
}

export async function getReserve(currency: Currency, trx?: Knex.Transaction): Promise<number> {
  let query = reservesTable(trx)
    .where({ currency })
    .select('amount')
    .first();

  // Lock the row inside a transaction
  if (trx) {
    query = query.forUpdate();
  }

  const row = await query;
  return row ? parseFloat(row.amount) : 0;
}

export async function addReserve(
  currency: Currency,
  amount: number,
  trx?: Knex.Transaction
): Promise<void> {
  const current = await getReserve(currency, trx);
  const newTotal = parseFloat((current + amount).toFixed(4));

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
  amount: number,
  trx?: Knex.Transaction
): Promise<void> {
  const current = await getReserve(currency, trx);
  if (current < amount) {
    throw new InsufficientLiquidityError(current, amount, currency);
  }
  const newTotal = parseFloat((current - amount).toFixed(4));
  await reservesTable(trx)
    .where({ currency })
    .update({ amount: newTotal, updated_at: new Date() });
}

// ----------------------------
//  Validation
// ----------------------------

export async function validateLiquidity(
  currency: Currency,
  amount: number,
  trx?: Knex.Transaction
): Promise<{
  valid: boolean;
  available: number;
  required: number;
  shortfall: number;
}> {
  const available = await getReserve(currency, trx);
  const valid = available >= amount;
  return {
    valid,
    available,
    required: amount,
    shortfall: valid ? 0 : parseFloat((amount - available).toFixed(4)),
  };
}

// ----------------------------
//  Seed Initial Reserves
// ----------------------------

export async function seedReserves(seeds: Partial<Record<Currency, number>>): Promise<void> {
  const db = getDb();
  for (const [currency, amount] of Object.entries(seeds)) {
    const amt = amount ?? 0;
    const existing = await db('treasury_reserves').where({ currency }).first();
    if (existing) {
      await db('treasury_reserves').where({ currency }).update({ amount: amt, updated_at: new Date() });
    } else {
      await db('treasury_reserves').insert({ currency, amount: amt, updated_at: new Date() });
    }
    logger.info(`Treasury seeded: ${amt} ${currency}`);
  }
}
