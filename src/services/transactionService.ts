// ============================================================
//  TRANSACTION SERVICE ⭐ — Full Transfer Orchestrator
// ============================================================
//
//  CHANGE LOG (Phase 1 Hardening):
//  ─────────────────────────────────
//  - Steps 4–8 (balance check, debit, credit, treasury, ledger write)
//    are now wrapped in a single PostgreSQL transaction.
//  - FX conversion (step 2) runs OUTSIDE the DB transaction because it's
//    a pure in-memory computation with a static rate table — no external
//    call, no side effects to roll back.
//  - Compliance check (step 1) is also pure and runs outside the DB tx.
//  - If anything inside the DB transaction throws, PostgreSQL automatically
//    rolls back all changes — no orphaned debits, no phantom credits.
//  - Settlement queue enqueue (step 9) runs AFTER commit. The settlement
//    queue is in-memory and idempotent — if the server crashes between
//    commit and enqueue, the transaction is safely persisted and can be
//    picked up by a future settlement sweep.
//    FLAG: Settlement queue should be persisted in a future pass.
//  - Uses typed error classes instead of string-prefix errors.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  TransferRequestBody,
  TransferResponse,
  Transaction,
} from '../utils/types';
import { logger } from '../utils/logger';
import {
  ValidationError,
  AuthMismatchError,
  ComplianceBlockedError,
  FxError,
  InsufficientBalanceError,
  InsufficientLiquidityError,
} from '../utils/errors';
import { runComplianceCheck } from '../modules/compliance';
import { convert } from '../modules/fx';
import { validateLiquidity, deductReserve, addReserve } from '../modules/treasury';
import {
  getBalanceForCurrency,
  debit,
  credit,
  storeTransaction,
  createTransactionId,
} from '../modules/ledger';
import { enqueue } from '../modules/settlement';
import { getDb } from '../db/connection';

// ----------------------------
//  Input Validation
// ----------------------------

function validateTransferInput(body: TransferRequestBody): void {
  const { senderId, receiverId, amount, sourceCurrency, destCurrency } = body;

  if (!senderId || typeof senderId !== 'string') {
    throw new ValidationError('senderId is required');
  }
  if (!receiverId || typeof receiverId !== 'string') {
    throw new ValidationError('receiverId is required');
  }
  if (senderId === receiverId) {
    throw new ValidationError('Cannot transfer to yourself');
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new ValidationError('amount must be a positive number');
  }
  if (!sourceCurrency) {
    throw new ValidationError('sourceCurrency is required');
  }
  if (!destCurrency) {
    throw new ValidationError('destCurrency is required');
  }
}

// ----------------------------
//  Core Transfer Flow
// ----------------------------

export async function executeTransfer(
  body: TransferRequestBody,
  requestingUserId: string
): Promise<TransferResponse> {
  logger.separator();
  logger.tx(`Transfer initiated`, {
    from: body.senderId,
    to: body.receiverId,
    amount: body.amount,
    pair: `${body.sourceCurrency}→${body.destCurrency}`,
  });

  // ── Step 0: Validate input (pure) ──────────────────────────
  validateTransferInput(body);

  // Ensure the authenticated user can only send as themselves
  if (requestingUserId !== body.senderId) {
    throw new AuthMismatchError();
  }

  const { senderId, receiverId, amount, sourceCurrency, destCurrency } = body;

  // ── Step 1: Compliance Check (pure, outside DB tx) ─────────
  const compliance = runComplianceCheck({
    userId: senderId,
    amount,
    currency: sourceCurrency,
  });

  if (compliance.status === 'block') {
    throw new ComplianceBlockedError(
      compliance.score,
      compliance.reason ?? `Risk score ${compliance.score} exceeds threshold`
    );
  }

  // ── Step 2: FX Conversion (pure, outside DB tx) ────────────
  //  This is a static rate table lookup — no external API call.
  //  Safe to compute before the DB transaction. If it throws
  //  (unsupported pair), no side effects need rollback.
  let fx;
  try {
    fx = convert(sourceCurrency, destCurrency, amount);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FxError(message);
  }
  logger.debug(`FX rate applied`, { pair: fx.pair, rate: fx.rate });

  // ── Steps 3–8: DB Transaction (atomic) ─────────────────────
  //  Everything inside this block is a single PostgreSQL transaction.
  //  If ANY step throws, ALL changes are rolled back automatically.
  const db = getDb();
  const txId = createTransactionId();
  let tx: Transaction;

  await db.transaction(async (trx) => {
    // Step 3: Treasury liquidity validation (with row lock)
    const liquidity = await validateLiquidity(sourceCurrency, amount, trx);
    if (!liquidity.valid) {
      throw new InsufficientLiquidityError(
        liquidity.available,
        liquidity.required,
        sourceCurrency
      );
    }

    // Step 4: Sender balance check + lock (SELECT FOR UPDATE)
    //  debit() internally calls getBalanceForCurrency() which acquires
    //  the FOR UPDATE lock on the sender's account row when trx is provided.
    //  This serializes concurrent transfers from the same account.

    // Step 5: Debit sender (locked row)
    await debit(senderId, sourceCurrency, amount, trx);

    // Step 6: Credit receiver
    await credit(receiverId, destCurrency, fx.convertedAmount, trx);
    logger.tx(`Ledger updated`, {
      debit: `${senderId} -${amount} ${sourceCurrency}`,
      credit: `${receiverId} +${fx.convertedAmount} ${destCurrency}`,
    });

    // Step 7: Treasury update
    await deductReserve(sourceCurrency, amount, trx);
    await addReserve(destCurrency, fx.convertedAmount, trx);

    // Step 8: Build & store transaction record
    tx = {
      txId,
      sender: senderId,
      receiver: receiverId,
      originalAmount: amount,
      convertedAmount: fx.convertedAmount,
      sourceCurrency,
      destCurrency,
      rate: fx.rate,
      complianceScore: compliance.score,
      status: 'completed',
      timestamp: new Date(),
    };

    await storeTransaction(tx!, trx);
    logger.tx(`Transaction stored`, { txId, status: tx!.status });

    // ── COMMIT happens automatically when this callback returns ──
  });

  // ── Step 9: Push to Settlement Queue (AFTER commit) ────────
  //  Runs outside the DB transaction. The settlement queue is
  //  in-memory. If the server crashes between commit and enqueue,
  //  the transaction is already persisted in the DB. A future
  //  settlement sweep can pick up un-batched transactions.
  //  FLAG: Settlement queue persistence is deferred to a future pass.
  enqueue(tx!);

  // ── Step 10: Return Response ───────────────────────────────
  logger.success(`Transfer complete`, { txId });
  logger.separator();

  return {
    success: true,
    txId,
    sender: senderId,
    receiver: receiverId,
    originalAmount: amount,
    convertedAmount: fx.convertedAmount,
    sourceCurrency,
    destCurrency,
    compliance,
    fx,
    status: tx!.status,
    timestamp: tx!.timestamp.toISOString(),
  };
}
