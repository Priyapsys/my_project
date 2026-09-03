// ============================================================
//  ROUTE: /api/kyc/*
//  Progressive KYC flow — ID → Address → Face → auto-VERIFIED
// ============================================================

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthenticatedRequest, IdType } from '../utils/types';
import { logger } from '../utils/logger';
import {
  getKycRecord,
  submitIdDocument,
  submitAddressProof,
  submitFaceVerification,
} from '../modules/kyc';

const router = Router();

// ============================================================
//  POST /api/kyc/submit
//  Step 1 — Submit government ID
//  Body: { idType: "passport"|"national_id"|"driver_license", idNumber: string }
// ============================================================
router.post('/submit', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { idType, idNumber } = req.body as { idType: IdType; idNumber: string };

  if (!idType || !idNumber) {
    res.status(400).json({
      success: false,
      error: 'idType and idNumber are required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const VALID_ID_TYPES: IdType[] = ['passport', 'national_id', 'driver_license'];
  if (!VALID_ID_TYPES.includes(idType)) {
    res.status(400).json({
      success: false,
      error: `idType must be one of: ${VALID_ID_TYPES.join(', ')}`,
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const record = await submitIdDocument(userId, idType, idNumber.trim());
    logger.success(`KYC step 1 (ID submit) done`, { userId });

    res.status(200).json({
      success: true,
      data: {
        userId,
        status: record.status,
        documentUploaded: record.documentUploaded,
        addressProofUploaded: record.addressProofUploaded,
        faceVerified: record.faceVerified,
        message: 'ID document submitted. Proceed to address proof.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed';
    res.status(500).json({
      success: false,
      error: message,
      code: 'KYC_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
//  POST /api/kyc/address
//  Step 2 — Submit address proof
//  Body: { addressProof: string }
// ============================================================
router.post('/address', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { addressProof } = req.body as { addressProof: string };

  if (!addressProof || typeof addressProof !== 'string' || addressProof.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'addressProof is required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const record = await submitAddressProof(userId, addressProof.trim());
    logger.success(`KYC step 2 (address) done`, { userId });

    res.status(200).json({
      success: true,
      data: {
        userId,
        status: record.status,
        documentUploaded: record.documentUploaded,
        addressProofUploaded: record.addressProofUploaded,
        faceVerified: record.faceVerified,
        message: record.status === 'VERIFIED'
          ? 'KYC complete. You are now verified.'
          : 'Address proof submitted. Proceed to face verification.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed';
    res.status(400).json({
      success: false,
      error: message,
      code: 'KYC_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
//  POST /api/kyc/face
//  Step 3 — Submit selfie / liveness check
//  Body: { selfie: string }
// ============================================================
router.post('/face', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { selfie } = req.body as { selfie: string };

  if (!selfie || typeof selfie !== 'string' || selfie.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'selfie is required',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const record = await submitFaceVerification(userId, selfie.trim());
    logger.success(`KYC step 3 (face) done`, { userId });

    res.status(200).json({
      success: true,
      data: {
        userId,
        status: record.status,
        documentUploaded: record.documentUploaded,
        addressProofUploaded: record.addressProofUploaded,
        faceVerified: record.faceVerified,
        verifiedAt: record.verifiedAt?.toISOString() ?? null,
        message: record.status === 'VERIFIED'
          ? 'KYC complete. You are now fully verified.'
          : 'Face verification submitted. Awaiting review.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed';
    res.status(400).json({
      success: false,
      error: message,
      code: 'KYC_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
//  GET /api/kyc/status
//  Returns full KYC object for the authenticated user
// ============================================================
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const record = await getKycRecord(userId);

  res.status(200).json({
    success: true,
    data: {
      userId,
      status: record?.status ?? 'PENDING',
      idType: record?.idType ?? null,
      idNumber: record?.idNumber ?? null,
      documentUploaded: record?.documentUploaded ?? false,
      addressProofUploaded: record?.addressProofUploaded ?? false,
      faceVerified: record?.faceVerified ?? false,
      createdAt: record?.createdAt?.toISOString() ?? null,
      verifiedAt: record?.verifiedAt?.toISOString() ?? null,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
