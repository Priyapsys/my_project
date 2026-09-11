// ============================================================
//  MONEY UTILITY — Exact Decimal Arithmetic for Financial Values
// ============================================================
//
//  Every monetary calculation in GlobalPay MUST go through this
//  module. JavaScript `number` is IEEE-754 double-precision float
//  and is fundamentally unsuitable for financial arithmetic.
//
//  Rules:
//  1. Monetary values travel as `string` between DB ↔ JS.
//  2. All arithmetic uses Decimal internally, returns `string`.
//  3. Raw JavaScript `number` is STRICTLY PROHIBITED in monetary
//     calculations and database operations.
//  4. Calculation precision is preserved without premature truncation.
//     Currency rounding and minor-unit conversions are separate.
// ============================================================

import Decimal from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 38,       // match DB NUMERIC(38,18) capacity
  rounding: Decimal.ROUND_HALF_UP,
});

/** The string "0" — safe zero value for monetary fields */
export const ZERO = '0';

// ----------------------------
//  Currency Precision Config
// ----------------------------

export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  INR: 2,
  GBP: 2,
  EUR: 2,
  AED: 2,
  JPY: 0,
};

/**
 * Get standard decimal places for a supported currency (defaults to 2).
 */
export function getCurrencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

// ----------------------------
//  Coercion & Validation
// ----------------------------

/**
 * Safely coerce a value to a Decimal instance.
 * Accepts string or Decimal ONLY.
 * Throws on non-numeric strings, NaN, or Infinity.
 */
export function toDecimal(value: string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid monetary value: expected non-empty string or Decimal, received ${typeof value}`);
  }
  const d = new Decimal(value.trim());
  if (!d.isFinite()) {
    throw new Error(`Invalid monetary value: ${value}`);
  }
  return d;
}

/**
 * Round a monetary value to a specific currency's decimal precision.
 * USD 10.255 → "10.26"
 * JPY 151.6  → "152"
 */
export function roundToCurrency(
  value: string | Decimal,
  currency: string,
  roundingMode = Decimal.ROUND_HALF_UP
): string {
  const decimals = getCurrencyDecimals(currency);
  return toDecimal(value).toFixed(decimals, roundingMode);
}

/**
 * Convert a value to a formatted money string.
 * If currency is provided, rounds to that currency's decimal places.
 * If not provided, formats to 4 decimal places matching DB NUMERIC(18,4) column defaults.
 */
export function toMoneyString(value: string | Decimal, currency?: string): string {
  if (currency) {
    return roundToCurrency(value, currency);
  }
  return toDecimal(value).toFixed(4);
}

// ----------------------------
//  Arithmetic (Preserves Calculation Precision)
// ----------------------------

/** Exact addition: a + b */
export function add(a: string | Decimal, b: string | Decimal): string {
  return toDecimal(a).plus(toDecimal(b)).toString();
}

/** Exact subtraction: a - b */
export function sub(a: string | Decimal, b: string | Decimal): string {
  return toDecimal(a).minus(toDecimal(b)).toString();
}

/** Exact multiplication: a × b (preserves calculation precision) */
export function mul(a: string | Decimal, b: string | Decimal): string {
  return toDecimal(a).times(toDecimal(b)).toString();
}

/** Exact division: a ÷ b (preserves calculation precision) */
export function div(a: string | Decimal, b: string | Decimal): string {
  return toDecimal(a).div(toDecimal(b)).toString();
}

// ----------------------------
//  Comparison
// ----------------------------

/** a >= b */
export function gte(a: string | Decimal, b: string | Decimal): boolean {
  return toDecimal(a).gte(toDecimal(b));
}

/** a < b */
export function lt(a: string | Decimal, b: string | Decimal): boolean {
  return toDecimal(a).lt(toDecimal(b));
}

/** a > b */
export function gt(a: string | Decimal, b: string | Decimal): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

/** a === b */
export function eq(a: string | Decimal, b: string | Decimal): boolean {
  return toDecimal(a).eq(toDecimal(b));
}

/** value < 0 */
export function isNegative(value: string | Decimal): boolean {
  return toDecimal(value).isNeg();
}

/** value === 0 */
export function isZero(value: string | Decimal): boolean {
  return toDecimal(value).isZero();
}

/** max(a, b) — returns exact string */
export function max(a: string | Decimal, b: string | Decimal): string {
  const da = toDecimal(a);
  const db = toDecimal(b);
  return (da.gte(db) ? da : db).toString();
}

// ----------------------------
//  Stripe & Minor Unit Helpers
// ----------------------------

/**
 * Convert a decimal monetary value to integer minor units (e.g. cents).
 * USD 10.25 → 1025
 * JPY 1000  → 1000
 * Validates that the resulting integer is within JavaScript's safe integer range.
 */
export function toMinorUnits(value: string | Decimal, currency = 'USD'): number {
  const decimals = getCurrencyDecimals(currency);
  const factor = new Decimal(10).pow(decimals);
  const d = toDecimal(value).times(factor).round();
  const num = d.toNumber();
  if (!Number.isSafeInteger(num)) {
    throw new Error(
      `Monetary minor-unit value for ${value} (${currency}) exceeds JavaScript safe integer limit (${num})`
    );
  }
  return num;
}

/**
 * Convert integer minor units (e.g. cents) back to exact decimal string.
 * 1025 cents (USD) → "10.25"
 * 1000 JPY         → "1000"
 */
export function fromMinorUnits(minorUnits: number | string | Decimal, currency = 'USD'): string {
  const decimals = getCurrencyDecimals(currency);
  const factor = new Decimal(10).pow(decimals);
  const strUnits = typeof minorUnits === 'number' ? minorUnits.toString() : minorUnits;
  return toDecimal(strUnits).div(factor).toFixed(decimals);
}

