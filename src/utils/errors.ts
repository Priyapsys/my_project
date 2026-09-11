// ============================================================
//  CUSTOM ERROR TYPES — Typed Failures for Transaction Pipeline
// ============================================================
//
//  Each error class maps to a specific failure point in the
//  FX → Treasury → Ledger chain, enabling callers and logs to
//  distinguish failure causes without parsing error message strings.
// ============================================================

/**
 * Base class for all GlobalPay domain errors.
 * Carries an error `code` for programmatic matching in route handlers.
 */
export class DomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    // Restore prototype chain (required for instanceof checks with TS targets < ES6)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * FX conversion failed — unsupported currency pair or rate lookup error.
 */
export class FxError extends DomainError {
  constructor(message: string) {
    super('FX_ERROR', message);
  }
}

/**
 * Sender does not have sufficient balance for the requested amount.
 */
export class InsufficientBalanceError extends DomainError {
  public readonly userId: string;
  public readonly available: string | number;
  public readonly required: string | number;

  constructor(userId: string, available: string | number, required: string | number, currency: string) {
    super(
      'INSUFFICIENT_FUNDS',
      `${userId} has ${available} ${currency}, needs ${required}`
    );
    this.userId = userId;
    this.available = available;
    this.required = required;
  }
}

/**
 * Treasury (system liquidity pool) does not have enough reserves.
 */
export class InsufficientLiquidityError extends DomainError {
  public readonly available: string | number;
  public readonly required: string | number;

  constructor(available: string | number, required: string | number, currency: string) {
    super(
      'INSUFFICIENT_LIQUIDITY',
      `Treasury has ${available} ${currency}, required ${required}`
    );
    this.available = available;
    this.required = required;
  }
}

/**
 * Failed to write a transaction record to the ledger.
 */
export class LedgerWriteError extends DomainError {
  constructor(message: string) {
    super('LEDGER_WRITE_ERROR', message);
  }
}

/**
 * Compliance engine blocked the transaction.
 */
export class ComplianceBlockedError extends DomainError {
  public readonly score: number;

  constructor(score: number, reason: string) {
    super('COMPLIANCE_BLOCKED', reason);
    this.score = score;
  }
}

/**
 * Input validation failure.
 */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}

/**
 * Auth mismatch — authenticated user doesn't match senderId.
 */
export class AuthMismatchError extends DomainError {
  constructor() {
    super('AUTH_MISMATCH', 'Authenticated user does not match senderId');
  }
}

/**
 * Blockchain anchoring failed.
 */
export class SettlementAnchorFailedError extends DomainError {
  constructor(message: string) {
    super('SETTLEMENT_ANCHOR_FAILED', message);
  }
}

/**
 * Concurrent update detected on account balance.
 */
export class ConcurrentUpdateError extends DomainError {
  constructor(message = 'Concurrent update detected on account balance') {
    super('CONCURRENT_UPDATE', message);
  }
}
