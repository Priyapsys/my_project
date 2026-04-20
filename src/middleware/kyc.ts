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

export function getKycRecord(userId: string): KycRecord | undefined {
  return _getKycRecord(userId);
}

/** Called on login: create a PENDING record if none exists */
export function setKycStatus(userId: string, status: KycStatus): void {
  if (status === 'PENDING') {
    _initKycRecord(userId);
  }
}

/** Seed multiple users as fully VERIFIED (demo users) */
export function seedKyc(userIds: string[]): void {
  _seedKycVerified(userIds);
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

  if (!_isVerified(userId)) {
    const record = _getKycRecord(userId);
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
