// ============================================================
//  KYC MIDDLEWARE — Block Unverified Users
//  Delegates all data operations to src/modules/kyc.ts
// ============================================================

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, KycRecord, KycStatus } from '../utils/types';
import { logger } from '../utils/logger';
import {
  getKycRecord      as _getKycRecord,
  initKycRecord     as _initKycRecord,
  isVerified        as _isVerified,
  seedKycVerified   as _seedKycVerified,
} from '../modules/kyc';

// ----------------------------
//  Re-exports (used by routes/auth.ts and server.ts)
// ----------------------------

export async function getKycRecord(userId: string): Promise<KycRecord | undefined> {
  return await _getKycRecord(userId);
}

/** Called on login: create a PENDING record if none exists */
export async function setKycStatus(userId: string, status: KycStatus): Promise<void> {
  if (status === 'PENDING') {
    await _initKycRecord(userId);
  }
}

/** Seed multiple users as fully VERIFIED (demo users) */
export async function seedKyc(userIds: string[]): Promise<void> {
  await _seedKycVerified(userIds);
}

// ----------------------------
//  Middleware
// ----------------------------

export async function kycMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

  const verified = await _isVerified(userId);
  if (!verified) {
    const record = await _getKycRecord(userId);
    logger.warn(`KYC: User not verified`, { userId, status: record?.status ?? 'NOT_FOUND' });
    res.status(403).json({
      success: false,
      error: 'KYC verification required before transaction',
      code: 'KYC_REQUIRED',
      currentStatus: record?.status ?? 'PENDING',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.debug(`KYC: Passed`, { userId });
  next();
}
