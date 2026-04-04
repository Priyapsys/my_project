// ============================================================
//  TREASURY MODULE — System Liquidity Pool
// ============================================================

import { Currency, TreasuryReserves } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  System Reserve Store
// ----------------------------
const reserves: TreasuryReserves = {};

// ----------------------------
//  Reserve Management
// ----------------------------

export function getReserves(): TreasuryReserves {
  return { ...reserves };
}

export function getReserve(currency: Currency): number {
  return reserves[currency] ?? 0;
}

export function addReserve(currency: Currency, amount: number): void {
  reserves[currency] = parseFloat(((reserves[currency] ?? 0) + amount).toFixed(4));
  logger.debug(`Treasury reserve added`, { currency, amount, newTotal: reserves[currency] });
}

export function deductReserve(currency: Currency, amount: number): void {
  const current = getReserve(currency);
  if (current < amount) {
    throw new Error(
      `INSUFFICIENT_LIQUIDITY: Treasury has ${current} ${currency}, required ${amount}`
    );
  }
  reserves[currency] = parseFloat((current - amount).toFixed(4));
}

// ----------------------------
//  Validation
// ----------------------------

export function validateLiquidity(currency: Currency, amount: number): {
  valid: boolean;
  available: number;
  required: number;
  shortfall: number;
} {
  const available = getReserve(currency);
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

export function seedReserves(seeds: Partial<Record<Currency, number>>): void {
  for (const [currency, amount] of Object.entries(seeds)) {
    reserves[currency as Currency] = amount ?? 0;
    logger.info(`Treasury seeded: ${amount} ${currency}`);
  }
}
