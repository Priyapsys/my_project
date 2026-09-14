// ============================================================
//  IDEMPOTENCY MIDDLEWARE — Replay & Race Protection for Write Endpoints
// ============================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/connection';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../utils/types';

function isUniqueViolation(err: any): boolean {
  return (
    err?.code === '23505' ||
    err?.code === 'SQLITE_CONSTRAINT' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint failed'))
  );
}

/**
 * Deterministically canonicalize an object to JSON for consistent hashing.
 */
function canonicalize(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/**
 * Compute SHA-256 hash of canonicalized request body.
 */
export function hashRequestBody(body: any): string {
  const canonical = canonicalize(body);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Send cached response with appropriate headers.
 */
function sendCachedResponse(
  res: Response,
  statusCode: number,
  responseBody: string | null
): void {
  res.setHeader('X-Cache', 'HIT');
  res.setHeader('Idempotent-Replayed', 'true');

  let parsed: any = null;
  if (responseBody) {
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      parsed = responseBody;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    res.status(statusCode).json(parsed);
  } else {
    res.status(statusCode).send(parsed);
  }
}

/**
 * Attach response interceptor to record final status and payload.
 */
function attachInterceptor(
  userId: string,
  route: string,
  key: string,
  res: Response
): void {
  const db = getDb();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let handled = false;

  const saveResponse = (status: number, body: any) => {
    if (handled) return;
    handled = true;
    const finalStatus = status >= 200 && status < 300 ? 'succeeded' : 'failed';
    const bodyStr =
      body === undefined || body === null
        ? null
        : typeof body === 'string'
        ? body
        : JSON.stringify(body);

    db('idempotency_keys')
      .where({ user_id: userId, route, idempotency_key: key })
      .update({
        status: finalStatus,
        response_status: status,
        response_body: bodyStr,
        updated_at: new Date(),
      })
      .catch((updateErr) => {
        logger.error('Failed to update idempotency key record', {
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          key,
          route,
          userId,
        });
      });
  };

  res.json = function (body: any): Response {
    saveResponse(res.statusCode || 200, body);
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    saveResponse(res.statusCode || 200, body);
    return originalSend(body);
  };

  res.on('finish', () => {
    if (!handled) {
      saveResponse(res.statusCode || 200, null);
    }
  });

  res.on('close', () => {
    if (!handled) {
      saveResponse(500, null);
    }
  });
}

/**
 * Clean up expired idempotency keys.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const db = getDb();
  const count = await db('idempotency_keys')
    .where('expires_at', '<', new Date())
    .del();
  return count;
}

export interface IdempotencyOptions {
  required?: boolean;
}

export function createIdempotencyMiddleware(options: IdempotencyOptions = {}) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const rawKey = req.headers['idempotency-key'] as string | undefined;

    if (!rawKey || rawKey.trim() === '') {
      // Required on transfer route or when explicitly configured as required
      const isTransfer = req.baseUrl.includes('transfer') || req.path.includes('transfer');
      if (options.required || isTransfer) {
        res.status(422).json({
          success: false,
          error: 'Idempotency-Key header is required for write operations',
          code: 'MISSING_IDEMPOTENCY_KEY',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      return next();
    }

    const userId = (req as AuthenticatedRequest).userId || (req as any).userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required for idempotent write operations',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const key = rawKey.trim();
    const route = (req.baseUrl + req.path).replace(/\/+$/, '') || '/';
    const requestHash = hashRequestBody(req.body);

    handleIdempotency(userId, route, key, requestHash, req, res, next).catch((err) => {
      logger.error('Idempotency middleware error', {
        error: err instanceof Error ? err.message : String(err),
        key,
        route,
        userId,
      });
      next(err);
    });
  };
}

export const idempotencyMiddleware = Object.assign(
  (req: Request, res: Response, next: NextFunction): void => {
    createIdempotencyMiddleware()(req, res, next);
  },
  { create: createIdempotencyMiddleware }
);

async function handleIdempotency(
  userId: string,
  route: string,
  key: string,
  requestHash: string,
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const db = getDb();
  const ttlSeconds = Number(process.env.IDEMPOTENCY_TTL_SECONDS) || 86400; // default 24h
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await db('idempotency_keys').insert({
      user_id: userId,
      route,
      idempotency_key: key,
      request_hash: requestHash,
      status: 'pending',
      response_status: null,
      response_body: null,
      resource_id: null,
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      return await handleConflict(userId, route, key, requestHash, expiresAt, res, next);
    }
    throw err;
  }

  // Insert succeeded — this request holds the in-flight lock.
  attachInterceptor(userId, route, key, res);
  next();
}

async function handleConflict(
  userId: string,
  route: string,
  key: string,
  requestHash: string,
  expiresAt: Date,
  res: Response,
  next: NextFunction
): Promise<void> {
  const db = getDb();
  const existing = await db('idempotency_keys')
    .where({ user_id: userId, route, idempotency_key: key })
    .first();

  if (!existing) {
    // Row might have been deleted or expired concurrently; re-attempt insert
    return handleIdempotency(userId, route, key, requestHash, null as any, res, next);
  }

  // 1. Failed status: allow retry with same key
  if (existing.status === 'failed') {
    await db('idempotency_keys')
      .where({ user_id: userId, route, idempotency_key: key })
      .update({
        status: 'pending',
        request_hash: requestHash,
        response_status: null,
        response_body: null,
        expires_at: expiresAt,
        updated_at: new Date(),
      });

    attachInterceptor(userId, route, key, res);
    return next();
  }

  // 2. Succeeded status: return cached response or reject if payload changed
  if (existing.status === 'succeeded') {
    if (existing.request_hash !== requestHash) {
      res.status(409).json({
        success: false,
        error: 'Idempotency key was already used with a different request payload',
        code: 'IDEMPOTENCY_KEY_REUSED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    return sendCachedResponse(res, existing.response_status || 200, existing.response_body);
  }

  // 3. Pending status: concurrent request in flight. Poll briefly (up to 3s).
  const MAX_ATTEMPTS = 30; // 30 x 100ms = 3000ms
  const POLL_INTERVAL_MS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const current = await db('idempotency_keys')
      .where({ user_id: userId, route, idempotency_key: key })
      .first();

    if (!current) break;

    if (current.status === 'succeeded') {
      if (current.request_hash !== requestHash) {
        res.status(409).json({
          success: false,
          error: 'Idempotency key was already used with a different request payload',
          code: 'IDEMPOTENCY_KEY_REUSED',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      return sendCachedResponse(res, current.response_status || 200, current.response_body);
    }

    if (current.status === 'failed') {
      // Previous attempt failed, allow retry
      await db('idempotency_keys')
        .where({ user_id: userId, route, idempotency_key: key })
        .update({
          status: 'pending',
          request_hash: requestHash,
          response_status: null,
          response_body: null,
          expires_at: expiresAt,
          updated_at: new Date(),
        });

      attachInterceptor(userId, route, key, res);
      return next();
    }
  }

  logger.warn(`Idempotency race conflict`, { key, route, userId });
  res.status(409).json({
    success: false,
    error: 'Concurrent request with the same idempotency key is still in progress',
    code: 'REQUEST_IN_PROGRESS',
    timestamp: new Date().toISOString(),
  });
}
