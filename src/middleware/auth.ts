// ============================================================
//  AUTH MIDDLEWARE — JWT-Based Bearer Token Validation
// ============================================================

import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';

// ── JWT Configuration ───────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  throw new Error('FATAL: JWT_SECRET environment variable is required but not set.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN_RAW = process.env.JWT_EXPIRES_IN ?? '1h';
// Parse as seconds if purely numeric, otherwise keep as duration string
const JWT_EXPIRES_IN: number | string =
  /^\d+$/.test(JWT_EXPIRES_IN_RAW) ? parseInt(JWT_EXPIRES_IN_RAW, 10) : JWT_EXPIRES_IN_RAW;

// ── Token payload shape ─────────────────────────────────────
export interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

// ── Issue a signed JWT ──────────────────────────────────────
// TODO: Implement refresh tokens — issue a long-lived refresh token alongside
//       the short-lived access token, store refresh tokens server-side (DB),
//       and add a POST /api/auth/refresh endpoint to rotate them.
export function issueToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

// ── Auth Middleware ──────────────────────────────────────────
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // ── Missing header ────────────────────────────────────────
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Auth: Missing or malformed Authorization header`, {
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: 'Authorization header required: Bearer <token>',
      code: 'AUTH_MISSING_TOKEN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Token is empty',
      code: 'AUTH_MISSING_TOKEN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ── Verify JWT ────────────────────────────────────────────
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId;
    logger.debug(`Auth: Validated`, { userId: decoded.userId, path: req.path });
    next();
  } catch (err) {
    // Distinguish error types for clear client feedback
    if (err instanceof TokenExpiredError) {
      logger.warn(`Auth: Expired token`, { path: req.path, expiredAt: err.expiredAt });
      res.status(401).json({
        success: false,
        error: 'Token has expired',
        code: 'AUTH_TOKEN_EXPIRED',
        timestamp: new Date().toISOString(),
      });
    } else if (err instanceof JsonWebTokenError) {
      // Covers both malformed tokens and invalid signatures
      const isMalformed = err.message === 'jwt malformed' || err.message.includes('Unexpected token');
      logger.warn(`Auth: Invalid token`, { path: req.path, reason: err.message });
      res.status(401).json({
        success: false,
        error: isMalformed ? 'Token is malformed' : 'Invalid token signature',
        code: isMalformed ? 'AUTH_MALFORMED_TOKEN' : 'AUTH_INVALID_SIGNATURE',
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error(`Auth: Unexpected verification error`, {
        path: req.path,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(401).json({
        success: false,
        error: 'Token verification failed',
        code: 'AUTH_INVALID_TOKEN',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Re-export JWT_SECRET for test helpers only — not for production use
export const _testSecret = JWT_SECRET;
