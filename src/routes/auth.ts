// ============================================================
//  ROUTE: AUTH — /api/login, /api/auth/login, /api/auth/signup, /api/signup
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { issueToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getKycRecord, setKycStatus } from '../middleware/kyc';
import { authRateLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validation';
import { loginSchema, signupSchema } from '../schemas';
import { createUser, getUser, verifyPassword } from '../modules/users';

const router = Router();

// Apply auth rate limiter (5 req/min per IP) to all auth endpoints
router.use(authRateLimiter);

// ── Login Handler ───────────────────────────────────────────
const handleLogin = async (req: Request, res: Response): Promise<void> => {
  const { userId, password } = req.body;
  const cleanUserId = userId.trim().toLowerCase();

  if (password) {
    const user = await getUser(cleanUserId);
    const valid = Boolean(user && (await verifyPassword(password, user.password_hash)));
    if (!valid) {
      res.status(401).json({
        success: false,
        error: 'Invalid user ID or password',
        code: 'INVALID_CREDENTIALS',
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  const existingKyc = await getKycRecord(cleanUserId);
  if (!existingKyc) {
    await setKycStatus(cleanUserId, 'PENDING');
  }

  const token = issueToken(cleanUserId);
  logger.info('Login: JWT issued', { userId: cleanUserId });

  res.status(200).json({
    success: true,
    data: {
      userId: cleanUserId,
      token,
      message: 'Login successful. Use this token as: Authorization: Bearer <token>',
    },
    timestamp: new Date().toISOString(),
  });
};

// ── Signup Handler ──────────────────────────────────────────
const handleSignup = async (req: Request, res: Response): Promise<void> => {
  const { userId, password } = req.body;
  const cleanUserId = userId.trim().toLowerCase();

  const existingUser = await getUser(cleanUserId);
  if (existingUser) {
    res.status(409).json({
      success: false,
      error: 'User already exists',
      code: 'USER_EXISTS',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const pwd = password || (process.env.TEST_USER_PASSWORD ?? 'TestPassword123!');
  try {
    await createUser(cleanUserId, pwd);
  } catch (err: any) {
    if (err?.code === '23505' || err?.code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({
        success: false,
        error: 'User already exists',
        code: 'USER_EXISTS',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    throw err;
  }

  const existingKyc = await getKycRecord(cleanUserId);
  if (!existingKyc) {
    await setKycStatus(cleanUserId, 'PENDING');
  }

  const token = issueToken(cleanUserId);
  logger.info('Signup: User registered and JWT issued', { userId: cleanUserId });

  res.status(201).json({
    success: true,
    data: {
      userId: cleanUserId,
      token,
      message: 'Signup successful. Use this token as: Authorization: Bearer <token>',
    },
    timestamp: new Date().toISOString(),
  });
};

// Route definitions supporting /login, /signup and mounted roots (/api/login, /api/signup)
router.post('/login', validateBody(loginSchema), handleLogin);
router.post('/signup', validateBody(signupSchema), handleSignup);

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  if (req.baseUrl.endsWith('/signup')) {
    return validateBody(signupSchema)(req, res, () => handleSignup(req, res));
  }
  return validateBody(loginSchema)(req, res, () => handleLogin(req, res));
});

export default router;
