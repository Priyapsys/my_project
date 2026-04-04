// ============================================================
//  AUTH MIDDLEWARE — Bearer Token Validation
// ============================================================

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../utils/types';
import { logger } from '../utils/logger';

// In-memory token store: token → userId
const tokenStore = new Map<string, string>();

export function issueToken(userId: string): string {
  const token = `token-${userId}`;
  tokenStore.set(token, userId);
  return token;
}

export function revokeToken(token: string): void {
  tokenStore.delete(token);
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Auth: Missing or malformed Authorization header`, {
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: 'Authorization header required: Bearer <token>',
      code: 'AUTH_REQUIRED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const userId = tokenStore.get(token);

  if (!userId) {
    logger.warn(`Auth: Invalid token`, { token: token.slice(0, 12) + '...', path: req.path });
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'AUTH_INVALID_TOKEN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  req.userId = userId;
  logger.debug(`Auth: Validated`, { userId, path: req.path });
  next();
}
