// ============================================================
//  KYC MODULE — Structured Global KYC System
//  Handles the full progressive KYC flow:
//    1. Submit ID document
//    2. Submit address proof
//    3. Submit face / liveness
//  Auto-verifies once all three steps are complete.
// ============================================================

import { KycRecord, KycStatus, IdType } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  In-Memory KYC Store
// ----------------------------
const kycStore = new Map<string, KycRecord>();

// ----------------------------
//  Create a blank PENDING record
// ----------------------------
function createPendingRecord(userId: string): KycRecord {
  return {
    userId,
    status: 'PENDING',
    idType: undefined,
    idNumber: undefined,
    documentUploaded: false,
    addressProofUploaded: false,
    faceVerified: false,
    createdAt: new Date(),
    verifiedAt: undefined,
  };
}

// ----------------------------
//  Internal auto-verify helper
//  Called after every step update.
// ----------------------------
function tryAutoVerify(record: KycRecord): void {
  if (
    record.documentUploaded &&
    record.addressProofUploaded &&
    record.faceVerified &&
    record.status !== 'VERIFIED'
  ) {
    record.status = 'VERIFIED';
    record.verifiedAt = new Date();
    logger.success(`KYC auto-verified: ${record.userId}`);
  }
}

// ============================================================
//  Public API
// ============================================================

/**
 * Returns the KYC record for a user, or undefined if none exists.
 */
export function getKycRecord(userId: string): KycRecord | undefined {
  return kycStore.get(userId);
}

/**
 * Initialise a PENDING KYC record for a new user.
 * No-op if a record already exists (preserves existing state).
 */
export function initKycRecord(userId: string): KycRecord {
  const existing = kycStore.get(userId);
  if (existing) return existing;

  const record = createPendingRecord(userId);
  kycStore.set(userId, record);
  logger.info(`KYC record created (PENDING): ${userId}`);
  return record;
}

/**
 * Seed a user as fully VERIFIED (for pre-seeded demo users).
 */
export function seedAsVerified(userId: string): void {
  const record: KycRecord = {
    userId,
    status: 'VERIFIED',
    idType: 'passport',
    idNumber: `SEED-${userId.toUpperCase()}`,
    documentUploaded: true,
    addressProofUploaded: true,
    faceVerified: true,
    createdAt: new Date(),
    verifiedAt: new Date(),
  };
  kycStore.set(userId, record);
  logger.info(`KYC seeded as VERIFIED: ${userId}`);
}

/**
 * Seed multiple users as VERIFIED.
 */
export function seedKycVerified(userIds: string[]): void {
  for (const userId of userIds) {
    seedAsVerified(userId);
  }
}

/**
 * Step 1 — Submit ID document.
 * Sets: idType, idNumber, documentUploaded = true
 * Triggers auto-verify check.
 */
export function submitIdDocument(
  userId: string,
  idType: IdType,
  idNumber: string
): KycRecord {
  const record = kycStore.get(userId) ?? createPendingRecord(userId);

  record.idType = idType;
  record.idNumber = idNumber;
  record.documentUploaded = true;

  kycStore.set(userId, record);
  logger.info(`KYC step 1 (ID) completed: ${userId}`, { idType });

  tryAutoVerify(record);
  return record;
}

/**
 * Step 2 — Submit address proof.
 * Sets: addressProofUploaded = true
 * Triggers auto-verify check.
 */
export function submitAddressProof(
  userId: string,
  _addressProof: string   // stored/forwarded in a real system
): KycRecord {
  const record = kycStore.get(userId);
  if (!record) {
    throw new Error('KYC record not found. Please submit your ID first.');
  }

  record.addressProofUploaded = true;
  logger.info(`KYC step 2 (address) completed: ${userId}`);

  tryAutoVerify(record);
  return record;
}

/**
 * Step 3 — Submit selfie / face verification.
 * Sets: faceVerified = true
 * Triggers auto-verify check.
 */
export function submitFaceVerification(
  userId: string,
  _selfie: string         // analysed by liveness service in production
): KycRecord {
  const record = kycStore.get(userId);
  if (!record) {
    throw new Error('KYC record not found. Please submit your ID first.');
  }

  record.faceVerified = true;
  logger.info(`KYC step 3 (face) completed: ${userId}`);

  tryAutoVerify(record);
  return record;
}

/**
 * Returns true only if the user's KYC status is VERIFIED.
 */
export function isVerified(userId: string): boolean {
  return kycStore.get(userId)?.status === 'VERIFIED';
}
