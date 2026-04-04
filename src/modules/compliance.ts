// ============================================================
//  COMPLIANCE MODULE — Risk Scoring Engine
// ============================================================

import { ComplianceResult, Currency } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  Config
// ----------------------------
const BLOCK_THRESHOLD = 90;
const HIGH_RISK_AMOUNT: Record<string, number> = {
  USD: 9500,
  GBP: 7500,
  EUR: 8800,
  INR: 800000,
  AED: 35000,
  JPY: 1400000,
};

// ----------------------------
//  Scoring Factors
// ----------------------------

interface ScoringContext {
  userId: string;
  amount: number;
  currency: Currency;
  receiverId?: string;
  txCountToday?: number;
}

function scoreAmount(amount: number, currency: Currency): number {
  const threshold = HIGH_RISK_AMOUNT[currency] ?? 10000;
  if (amount >= threshold) return 35;
  if (amount >= threshold * 0.7) return 20;
  if (amount >= threshold * 0.5) return 10;
  return 0;
}

function scoreUserPattern(userId: string): number {
  // Deterministic pseudo-risk based on userId (simulates ML scoring)
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 50;
  }
  return hash;
}

function scoreFrequency(txCountToday: number): number {
  if (txCountToday > 20) return 25;
  if (txCountToday > 10) return 15;
  if (txCountToday > 5) return 5;
  return 0;
}

// ----------------------------
//  Main Compliance Check
// ----------------------------

export function runComplianceCheck(ctx: ScoringContext): ComplianceResult {
  const amountScore     = scoreAmount(ctx.amount, ctx.currency);
  const patternScore    = scoreUserPattern(ctx.userId);
  const frequencyScore  = scoreFrequency(ctx.txCountToday ?? 0);

  const totalScore = Math.min(100, amountScore + patternScore + frequencyScore);
  const blocked    = totalScore >= BLOCK_THRESHOLD;
  const flagged    = totalScore >= 60;

  const result: ComplianceResult = {
    score:   totalScore,
    status:  blocked ? 'block' : 'pass',
    flagged,
    reason:  blocked
      ? `Risk score ${totalScore} exceeds threshold ${BLOCK_THRESHOLD}`
      : flagged
        ? `Elevated risk: score ${totalScore} — monitoring`
        : undefined,
  };

  if (blocked) {
    logger.warn(`Compliance BLOCKED transaction`, {
      userId: ctx.userId,
      score: totalScore,
      amount: ctx.amount,
      currency: ctx.currency,
    });
  } else if (flagged) {
    logger.warn(`Compliance FLAGGED transaction (allowed)`, {
      userId: ctx.userId,
      score: totalScore,
    });
  } else {
    logger.debug(`Compliance PASSED`, { userId: ctx.userId, score: totalScore });
  }

  return result;
}
