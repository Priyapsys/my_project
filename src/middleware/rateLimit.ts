// ============================================================
//  RATE LIMIT MIDDLEWARE — Protection for High-Risk Endpoints
// ============================================================

import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../utils/types';

export const transferRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // Max 10 requests per window
  keyGenerator: (req) => {
    return (req as AuthenticatedRequest).userId || req.ip || 'anonymous';
  },
  validate: { trustProxy: process.env.TRUST_PROXY === 'true', xForwardedForHeader: false, default: false },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
