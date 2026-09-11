// ============================================================
//  MONEY UTILITY — Comprehensive Unit Tests
// ============================================================

import * as money from '../../src/utils/money';
import Decimal from 'decimal.js';

describe('Money Utility Unit Tests', () => {
  describe('toDecimal strictness', () => {
    it('accepts valid decimal strings', () => {
      expect(money.toDecimal('10.25').toString()).toBe('10.25');
      expect(money.toDecimal('0').toString()).toBe('0');
      expect(money.toDecimal('0.0001').toString()).toBe('0.0001');
    });

    it('accepts Decimal instances', () => {
      const d = new Decimal('99.99');
      expect(money.toDecimal(d)).toBe(d);
    });

    it('rejects empty or whitespace strings', () => {
      expect(() => money.toDecimal('')).toThrow('Invalid monetary value');
      expect(() => money.toDecimal('   ')).toThrow('Invalid monetary value');
    });

    it('rejects invalid numeric strings', () => {
      expect(() => money.toDecimal('abc')).toThrow();
      expect(() => money.toDecimal('10.25.30')).toThrow();
    });

    it('rejects non-string values at runtime', () => {
      expect(() => money.toDecimal(null as any)).toThrow('Invalid monetary value');
      expect(() => money.toDecimal(undefined as any)).toThrow('Invalid monetary value');
    });
  });

  describe('Calculation precision (no premature 4-decimal rounding)', () => {
    it('preserves exact addition precision beyond 4 decimals', () => {
      const result = money.add('0.00001', '0.00002');
      expect(result).toBe('0.00003');
    });

    it('preserves exact subtraction precision', () => {
      const result = money.sub('1.00005', '0.00002');
      expect(result).toBe('1.00003');
    });

    it('preserves exact multiplication precision', () => {
      const result = money.mul('0.12345', '2');
      expect(result).toBe('0.2469');
      const highPrec = money.mul('0.123456', '0.5');
      expect(highPrec).toBe('0.061728');
    });

    it('max returns exact string without truncation', () => {
      expect(money.max('1.00001', '1.00002')).toBe('1.00002');
    });
  });

  describe('Currency precision rules', () => {
    it('rounds USD to 2 decimal places', () => {
      expect(money.roundToCurrency('10.255', 'USD')).toBe('10.26');
      expect(money.roundToCurrency('10.254', 'USD')).toBe('10.25');
    });

    it('rounds JPY to 0 decimal places', () => {
      expect(money.roundToCurrency('151.6', 'JPY')).toBe('152');
      expect(money.roundToCurrency('151.4', 'JPY')).toBe('151');
    });

    it('formats to 4 decimals when currency is omitted for DB storage', () => {
      expect(money.toMoneyString('10')).toBe('10.0000');
      expect(money.toMoneyString('10.5')).toBe('10.5000');
    });

    it('formats to currency decimals when currency is specified', () => {
      expect(money.toMoneyString('10.5', 'USD')).toBe('10.50');
      expect(money.toMoneyString('10.5', 'JPY')).toBe('11');
    });
  });

  describe('Minor units conversions (Stripe)', () => {
    it('converts USD to cents safely', () => {
      expect(money.toMinorUnits('10.25', 'USD')).toBe(1025);
      expect(money.toMinorUnits('0.01', 'USD')).toBe(1);
      expect(money.toMinorUnits('100', 'USD')).toBe(10000);
    });

    it('converts JPY to 0-decimal minor units', () => {
      expect(money.toMinorUnits('1500', 'JPY')).toBe(1500);
    });

    it('throws if minor units exceed Number.MAX_SAFE_INTEGER', () => {
      const huge = '99999999999999999999';
      expect(() => money.toMinorUnits(huge, 'USD')).toThrow('safe integer');
    });

    it('converts minor units back to exact decimal string without floating point error', () => {
      expect(money.fromMinorUnits(1025, 'USD')).toBe('10.25');
      expect(money.fromMinorUnits('1025', 'USD')).toBe('10.25');
      expect(money.fromMinorUnits(5000, 'USD')).toBe('50.00');
      expect(money.fromMinorUnits(1500, 'JPY')).toBe('1500');
    });
  });
});
