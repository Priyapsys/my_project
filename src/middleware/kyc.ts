// ============================================================
//  KYC MIDDLEWARE — Block Unverified Users
// ============================================================

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, KycRecord, KycStatus } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  In-Memory KYC Store
// ----------------------------
const kycStore = new Map<string, KycRecord>();

// ----------------------------
//  KYC Operations
// ----------------------------

export function setKycStatus(userId: string, status: KycStatus): void {
  const record: KycRecord = {
    userId,
    status,
    verifiedAt: status === 'verified' ? new Date() : undefined,
  };
  kycStore.set(userId, record);
}

export function getKycRecord(userId: string): KycRecord | undefined {
  return kycStore.get(userId);
}

export function isVerified(userId: string): boolean {
  return kycStore.get(userId)?.status === 'verified';
}

// ----------------------------
//  KYC Submit (registers user as pending)
// ----------------------------

export function submitKyc(userId: string): KycRecord {
  const existing = kycStore.get(userId);
  if (existing?.status === 'verified') {
    return existing; // Already verified, no-op
  }

  // In a real system: trigger document review pipeline
  // For demo: auto-verify after submission
  const record: KycRecord = {
    userId,
    status: 'verified',
    verifiedAt: new Date(),
  };
  kycStore.set(userId, record);

  logger.success(`KYC verified: ${userId}`);
  return record;
}

// ----------------------------
//  Middleware
// ----------------------------

export function kycMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required before KYC check',
      code: 'AUTH_REQUIRED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const record = getKycRecord(userId);

  if (!record || record.status !== 'verified') {
    logger.warn(`KYC: User not verified`, { userId, status: record?.status ?? 'unknown' });
    res.status(403).json({
      success: false,
      error: 'KYC verification required before making transactions',
      code: 'KYC_REQUIRED',
      currentStatus: record?.status ?? 'not_submitted',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.debug(`KYC: Passed`, { userId });
  next();
}

// ----------------------------
//  Seed KYC for Known Users
// ----------------------------

export function seedKyc(userIds: string[]): void {
  for (const userId of userIds) {
    setKycStatus(userId, 'verified');
    logger.info(`KYC seeded as verified: ${userId}`);
  }
}
