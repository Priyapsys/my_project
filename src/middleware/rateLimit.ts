// ============================================================
//  RATE LIMIT MIDDLEWARE — Protection for High-Risk Endpoints
// ============================================================

import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../utils/types';

/**
 * Helper to extract client IP, respecting X-Forwarded-For if provided.
 */
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'anonymous';
};

/**
 * Helper to determine whether rate limiting should be bypassed.
 * When NODE_ENV === 'test', requests are bypassed by default to prevent
 * test interference (e.g. concurrency tests), unless 'x-test-rate-limit: true'
 * is explicitly provided to test rate limiting behavior.
 */
export const shouldBypassRateLimit = (req: Request): boolean => {
  if (req.headers && req.headers['x-test-rate-limit'] === 'true') {
    return false;
  }
  return process.env.NODE_ENV === 'test';
};

/**
 * 1. Money-Movement Rate Limiter
 * Applied to POST /api/transfer and POST /api/settlement/run
 * Limit: 10 requests / minute per userId (falling back to IP).
 */
export const transferRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // Max 10 requests per window
  keyGenerator: (req) => {
    return (req as AuthenticatedRequest).userId || getClientIp(req);
  },
  skip: shouldBypassRateLimit,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
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

/**
 * 2. Auth Endpoint Rate Limiter
 * Applied to POST /api/login, POST /api/auth/login, POST /api/auth/signup, POST /api/signup
 * Limit: 5 requests / minute per IP to mitigate brute force & credential stuffing.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // Max 5 requests per window per IP
  keyGenerator: (req) => {
    return getClientIp(req);
  },
  skip: shouldBypassRateLimit,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      code: 'RATE_LIMITED',
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 3. General Global Rate Limiter
 * Baseline limiter applied to all routes in the system.
 * Limit: 100 requests / minute per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // Max 100 requests per window per IP
  keyGenerator: (req) => {
    return getClientIp(req);
  },
  skip: shouldBypassRateLimit,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
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


// Login is unauthenticated, so rate-limit by client IP to slow brute-force attempts.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later.',
      code: 'LOGIN_RATE_LIMITED',
      timestamp: new Date().toISOString(),
    });
  },
});
