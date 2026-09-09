// ============================================================
//  ROUTES: POST /api/signup | POST /api/login
// ============================================================

import { Router, Request, Response } from 'express';
import { issueToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getKycRecord, setKycStatus } from '../middleware/kyc';
import { loginRateLimiter } from '../middleware/rateLimit';
import { createUser, getUser, verifyPassword } from '../modules/users';

const router = Router();
const USER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,99}$/;
const MIN_PASSWORD_LENGTH = 8;

function readCredentials(req: Request): { userId: string; password: string } | undefined {
  const { userId, password } = req.body ?? {};
  if (typeof userId !== 'string' || typeof password !== 'string') return undefined;
  const cleanUserId = userId.trim().toLowerCase();
  if (!USER_ID_PATTERN.test(cleanUserId) || password.length < MIN_PASSWORD_LENGTH || password.length > 128) return undefined;
  return { userId: cleanUserId, password };
}

async function issueAuthResponse(userId: string, res: Response, message: string): Promise<void> {
  const existingKyc = await getKycRecord(userId);
  if (!existingKyc) await setKycStatus(userId, 'PENDING');
  const token = issueToken(userId);
  logger.info('JWT issued after credential verification', { userId });
  res.status(200).json({ success: true, data: { userId, token, message }, timestamp: new Date().toISOString() });
}

router.post('/signup', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const credentials = readCredentials(req);
  if (!credentials) {
    res.status(400).json({ success: false, error: 'userId must be 3-100 lowercase-safe characters and password must be 8-128 characters', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
    return;
  }
  if (await getUser(credentials.userId)) {
    res.status(409).json({ success: false, error: 'User already exists', code: 'USER_EXISTS', timestamp: new Date().toISOString() });
    return;
  }
  try {
    await createUser(credentials.userId, credentials.password);
  } catch (err: any) {
    if (err?.code === '23505' || err?.code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ success: false, error: 'User already exists', code: 'USER_EXISTS', timestamp: new Date().toISOString() });
      return;
    }
    throw err;
  }
  await issueAuthResponse(credentials.userId, res, 'Signup successful. Use this token as: Authorization: Bearer <token>');
});

router.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const credentials = readCredentials(req);
  const user = credentials ? await getUser(credentials.userId) : undefined;
  const valid = Boolean(user && credentials && await verifyPassword(credentials.password, user.password_hash));
  if (!valid || !credentials) {
    res.status(401).json({ success: false, error: 'Invalid user ID or password', code: 'INVALID_CREDENTIALS', timestamp: new Date().toISOString() });
    return;
  }
  await issueAuthResponse(credentials.userId, res, 'Login successful. Use this token as: Authorization: Bearer <token>');
});

export default router;
