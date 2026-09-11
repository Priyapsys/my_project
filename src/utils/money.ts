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
//  3. The ONLY place a monetary value may be a JS `number` is at
//     the JSON input boundary (request body) and the Stripe API
//     (integer cents).
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
//  Coercion
// ----------------------------

/**
 * Safely coerce a value to a Decimal instance.
 * Accepts string, number, or Decimal.
 * Throws on NaN / Infinity / non-numeric strings.
 */
export function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  const d = new Decimal(value);
  if (!d.isFinite()) {
    throw new Error(`Invalid monetary value: ${value}`);
  }
  return d;
}

/**
 * Convert a value to a string representation with 4 decimal places.
 * Use this when storing or returning monetary values.
 */
export function toMoneyString(value: string | number | Decimal): string {
  return toDecimal(value).toFixed(4);
}

// ----------------------------
//  Arithmetic (return string)
// ----------------------------

/** Exact addition: a + b */
export function add(a: string | number | Decimal, b: string | number | Decimal): string {
  return toDecimal(a).plus(toDecimal(b)).toFixed(4);
}

/** Exact subtraction: a - b */
export function sub(a: string | number | Decimal, b: string | number | Decimal): string {
  return toDecimal(a).minus(toDecimal(b)).toFixed(4);
}

/** Exact multiplication: a × b (use for FX conversion) */
export function mul(a: string | number | Decimal, b: string | number | Decimal): string {
  return toDecimal(a).times(toDecimal(b)).toFixed(4);
}

// ----------------------------
//  Comparison
// ----------------------------

/** a >= b */
export function gte(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).gte(toDecimal(b));
}

/** a < b */
export function lt(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).lt(toDecimal(b));
}

/** a > b */
export function gt(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

/** value < 0 */
export function isNegative(value: string | number | Decimal): boolean {
  return toDecimal(value).isNeg();
}

/** value === 0 */
export function isZero(value: string | number | Decimal): boolean {
  return toDecimal(value).isZero();
}

/** max(a, b) — returns string */
export function max(a: string | number | Decimal, b: string | number | Decimal): string {
  const da = toDecimal(a);
  const db = toDecimal(b);
  return (da.gte(db) ? da : db).toFixed(4);
}

// ----------------------------
//  Stripe Helpers
// ----------------------------

/**
 * Convert a decimal monetary value to integer minor units (e.g. cents).
 * USD 10.25 → 1025
 * This is the ONLY place where a monetary value becomes a JS number,
 * because Stripe's API requires an integer.
 */
export function toMinorUnits(value: string | number | Decimal): number {
  return toDecimal(value).times(100).round().toNumber();
}
