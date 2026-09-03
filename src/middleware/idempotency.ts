// ============================================================
//  IDEMPOTENCY MIDDLEWARE — Replay Protection for Write Endpoints
// ============================================================
//
//  Pattern: Standard idempotency-key middleware.
//
//  1. Read `Idempotency-Key` header from request.
//  2. If missing on a write endpoint → 422 Unprocessable Entity.
//  3. Look up (key, endpoint) in `idempotency_keys` table.
//  4. If found → return cached response (same status code + body).
//  5. If not found → proceed with handler, intercept the response,
//     store (key, endpoint, status, body) in DB, then send response.
//
//  Key is scoped per endpoint path to prevent cross-endpoint collisions.
//  E.g., the same key used on /api/transfer and /api/settlement/run
//  are treated as separate entries.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection';
import { logger } from '../utils/logger';

/**
 * Express middleware that enforces idempotency on write endpoints.
 * Attach to any POST/PUT/PATCH/DELETE route that mutates state.
 */
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    res.status(422).json({
      success: false,
      error: 'Idempotency-Key header is required for write operations',
      code: 'MISSING_IDEMPOTENCY_KEY',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const endpoint = req.baseUrl + req.path;
  const key = idempotencyKey.trim();

  // Check for cached response
  handleIdempotency(key, endpoint, req, res, next).catch((err) => {
    logger.error('Idempotency middleware error', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  });
}

async function handleIdempotency(
  key: string,
  endpoint: string,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const db = getDb();

  // Look up existing entry
  const existing = await db('idempotency_keys')
    .where({ key, endpoint })
    .first();

  if (existing) {
    // Cache hit — return the original response
    logger.info(`Idempotency cache hit`, { key, endpoint });
    const body = typeof existing.response_body === 'string'
      ? JSON.parse(existing.response_body)
      : existing.response_body;
    res.status(existing.status_code).json(body);
    return;
  }

  // Cache miss — intercept the response to capture it
  const originalJson = res.json.bind(res);

  res.json = function (body: any): Response {
    // Store the response in the idempotency table (fire-and-forget; errors logged but not fatal)
    db('idempotency_keys')
      .insert({
        key,
        endpoint,
        status_code: res.statusCode,
        response_body: JSON.stringify(body),
      })
      .catch((insertErr) => {
        // If this is a duplicate key error (race condition — two identical requests
        // arriving simultaneously), it's safe to ignore. The first one wins.
        if (insertErr?.code === '23505') {
          logger.debug('Idempotency key race: duplicate insert ignored', { key, endpoint });
        } else {
          logger.error('Failed to store idempotency key', {
            error: insertErr instanceof Error ? insertErr.message : String(insertErr),
            key,
            endpoint,
          });
        }
      });

    return originalJson(body);
  };

  next();
}
