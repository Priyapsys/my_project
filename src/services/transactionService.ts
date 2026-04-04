// ============================================================
//  TRANSACTION SERVICE ⭐ — Full 8-Step Transfer Orchestrator
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  TransferRequestBody,
  TransferResponse,
  Transaction,
} from '../utils/types';
import { logger } from '../utils/logger';
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

// ----------------------------
//  Input Validation
// ----------------------------

function validateTransferInput(body: TransferRequestBody): void {
  const { senderId, receiverId, amount, sourceCurrency, destCurrency } = body;

  if (!senderId || typeof senderId !== 'string') {
    throw new Error('VALIDATION: senderId is required');
  }
  if (!receiverId || typeof receiverId !== 'string') {
    throw new Error('VALIDATION: receiverId is required');
  }
  if (senderId === receiverId) {
    throw new Error('VALIDATION: Cannot transfer to yourself');
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error('VALIDATION: amount must be a positive number');
  }
  if (!sourceCurrency) {
    throw new Error('VALIDATION: sourceCurrency is required');
  }
  if (!destCurrency) {
    throw new Error('VALIDATION: destCurrency is required');
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

  // ── Step 0: Validate input ─────────────────────────────────
  validateTransferInput(body);

  // Ensure the authenticated user can only send as themselves
  if (requestingUserId !== body.senderId) {
    throw new Error('AUTH_MISMATCH: Authenticated user does not match senderId');
  }

  const { senderId, receiverId, amount, sourceCurrency, destCurrency } = body;

  // ── Step 1: Compliance Check ───────────────────────────────
  const compliance = runComplianceCheck({
    userId: senderId,
    amount,
    currency: sourceCurrency,
  });

  if (compliance.status === 'block') {
    throw new Error(`COMPLIANCE_BLOCKED: ${compliance.reason}`);
  }

  // ── Step 2: FX Conversion ──────────────────────────────────
  const fx = convert(sourceCurrency, destCurrency, amount);
  logger.debug(`FX rate applied`, { pair: fx.pair, rate: fx.rate });

  // ── Step 3: Treasury Validation ───────────────────────────
  const liquidity = validateLiquidity(sourceCurrency, amount);
  if (!liquidity.valid) {
    throw new Error(
      `INSUFFICIENT_LIQUIDITY: Treasury short ${liquidity.shortfall} ${sourceCurrency}`
    );
  }

  // ── Step 4: Sender Ledger Balance Check ───────────────────
  const senderBalance = getBalanceForCurrency(senderId, sourceCurrency);
  if (senderBalance < amount) {
    throw new Error(
      `INSUFFICIENT_FUNDS: ${senderId} has ${senderBalance} ${sourceCurrency}, needs ${amount}`
    );
  }

  // ── Step 5: Atomic Ledger Updates ─────────────────────────
  debit(senderId, sourceCurrency, amount);
  credit(receiverId, destCurrency, fx.convertedAmount);
  logger.tx(`Ledger updated`, {
    debit:  `${senderId} -${amount} ${sourceCurrency}`,
    credit: `${receiverId} +${fx.convertedAmount} ${destCurrency}`,
  });

  // ── Step 6: Treasury Update ────────────────────────────────
  deductReserve(sourceCurrency, amount);
  addReserve(destCurrency, fx.convertedAmount);

  // ── Step 7: Build & Store Transaction ─────────────────────
  const txId = createTransactionId();
  const tx: Transaction = {
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

  storeTransaction(tx);
  logger.tx(`Transaction stored`, { txId, status: tx.status });

  // ── Step 8: Push to Settlement Queue ──────────────────────
  enqueue(tx);

  // ── Step 9: Return Response ────────────────────────────────
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
    status: tx.status,
    timestamp: tx.timestamp.toISOString(),
  };
}
