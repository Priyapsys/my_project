// ============================================================
//  KYC MODULE — Structured Global KYC System (DB Persisted)
// ============================================================

import { KycRecord, KycStatus, IdType } from '../utils/types';
import { logger } from '../utils/logger';
import { getDb } from '../db/connection';

// ----------------------------
//  Row Mapper
// ----------------------------
function mapRowToKycRecord(row: any): KycRecord {
  return {
    userId: row.user_id,
    status: row.status as KycStatus,
    idType: row.id_type ?? undefined,
    idNumber: row.id_number ?? undefined,
    documentUploaded: Boolean(row.document_uploaded),
    addressProofUploaded: Boolean(row.address_proof_uploaded),
    faceVerified: Boolean(row.face_verified),
    createdAt: new Date(row.created_at),
    verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
  };
}

// ----------------------------
//  Internal auto-verify helper
// ----------------------------
async function checkAndAutoVerify(userId: string): Promise<KycRecord> {
  const db = getDb();
  const row = await db('kyc_records').where({ user_id: userId }).first();
  if (!row) throw new Error('KYC record not found');

  const record = mapRowToKycRecord(row);
  if (
    record.documentUploaded &&
    record.addressProofUploaded &&
    record.faceVerified &&
    record.status !== 'VERIFIED'
  ) {
    const verifiedAt = new Date();
    await db('kyc_records').where({ user_id: userId }).update({
      status: 'VERIFIED',
      verified_at: verifiedAt,
    });
    record.status = 'VERIFIED';
    record.verifiedAt = verifiedAt;
    logger.success(`KYC auto-verified: ${userId}`);
  }
  return record;
}

// ============================================================
//  Public API
// ============================================================

/**
 * Returns the KYC record for a user, or undefined if none exists.
 */
export async function getKycRecord(userId: string): Promise<KycRecord | undefined> {
  const db = getDb();
  const row = await db('kyc_records').where({ user_id: userId }).first();
  return row ? mapRowToKycRecord(row) : undefined;
}

/**
 * Initialise a PENDING KYC record for a new user.
 * No-op if a record already exists (preserves existing state).
 */
export async function initKycRecord(userId: string): Promise<KycRecord> {
  const existing = await getKycRecord(userId);
  if (existing) return existing;

  const db = getDb();
  const now = new Date();
  await db('kyc_records').insert({
    user_id: userId,
    status: 'PENDING',
    id_type: null,
    id_number: null,
    document_uploaded: false,
    address_proof_uploaded: false,
    face_verified: false,
    created_at: now,
    verified_at: null,
  });

  logger.info(`KYC record created (PENDING): ${userId}`);
  return {
    userId,
    status: 'PENDING',
    documentUploaded: false,
    addressProofUploaded: false,
    faceVerified: false,
    createdAt: now,
  };
}

/**
 * Seed a user as fully VERIFIED (for pre-seeded demo users).
 */
export async function seedAsVerified(userId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const existing = await db('kyc_records').where({ user_id: userId }).first();

  if (existing) {
    await db('kyc_records').where({ user_id: userId }).update({
      status: 'VERIFIED',
      id_type: 'passport',
      id_number: `SEED-${userId.toUpperCase()}`,
      document_uploaded: true,
      address_proof_uploaded: true,
      face_verified: true,
      verified_at: now,
    });
  } else {
    await db('kyc_records').insert({
      user_id: userId,
      status: 'VERIFIED',
      id_type: 'passport',
      id_number: `SEED-${userId.toUpperCase()}`,
      document_uploaded: true,
      address_proof_uploaded: true,
      face_verified: true,
      created_at: now,
      verified_at: now,
    });
  }
  logger.info(`KYC seeded as VERIFIED: ${userId}`);
}

/**
 * Seed multiple users as VERIFIED.
 */
export async function seedKycVerified(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await seedAsVerified(userId);
  }
}

/**
 * Step 1 — Submit ID document.
 */
export async function submitIdDocument(
  userId: string,
  idType: IdType,
  idNumber: string
): Promise<KycRecord> {
  const db = getDb();
  let existing = await getKycRecord(userId);
  if (!existing) {
    existing = await initKycRecord(userId);
  }

  await db('kyc_records').where({ user_id: userId }).update({
    id_type: idType,
    id_number: idNumber,
    document_uploaded: true,
  });

  logger.info(`KYC step 1 (ID) completed: ${userId}`, { idType });
  return await checkAndAutoVerify(userId);
}

/**
 * Step 2 — Submit address proof.
 */
export async function submitAddressProof(
  userId: string,
  _addressProof: string
): Promise<KycRecord> {
  const existing = await getKycRecord(userId);
  if (!existing) {
    throw new Error('KYC record not found. Please submit your ID first.');
  }

  const db = getDb();
  await db('kyc_records').where({ user_id: userId }).update({
    address_proof_uploaded: true,
  });

  logger.info(`KYC step 2 (address) completed: ${userId}`);
  return await checkAndAutoVerify(userId);
}

/**
 * Step 3 — Submit selfie / face verification.
 */
export async function submitFaceVerification(
  userId: string,
  _selfie: string
): Promise<KycRecord> {
  const existing = await getKycRecord(userId);
  if (!existing) {
    throw new Error('KYC record not found. Please submit your ID first.');
  }

  const db = getDb();
  await db('kyc_records').where({ user_id: userId }).update({
    face_verified: true,
  });

  logger.info(`KYC step 3 (face) completed: ${userId}`);
  return await checkAndAutoVerify(userId);
}

/**
 * Returns true only if the user's KYC status is VERIFIED.
 */
export async function isVerified(userId: string): Promise<boolean> {
  const record = await getKycRecord(userId);
  return record?.status === 'VERIFIED';
}
