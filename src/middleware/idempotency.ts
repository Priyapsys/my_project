// ============================================================
//  IDEMPOTENCY MIDDLEWARE — Replay & Race Protection for Write Endpoints
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection';
import { logger } from '../utils/logger';

function isUniqueViolation(err: any): boolean {
  return (
    err?.code === '23505' ||
    err?.code === 'SQLITE_CONSTRAINT' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint failed'))
  );
}

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
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const db = getDb();

  // Try to insert the idempotency lock record BEFORE executing the handler
  try {
    await db('idempotency_keys').insert({
      key,
      endpoint,
      status_code: 0,
      response_body: null,
    });
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      // Lock exists — poll for result or return cached response
      return await pollAndReturnCachedResponse(key, endpoint, res);
    }
    throw err;
  }

  // Insert succeeded — we hold the lock. Intercept response to update DB when handler finishes.
  const originalJson = res.json.bind(res);

  res.json = function (body: any): Response {
    db('idempotency_keys')
      .where({ key, endpoint })
      .update({
        status_code: res.statusCode,
        response_body: JSON.stringify(body),
      })
      .catch((updateErr) => {
        logger.error('Failed to update idempotency key record', {
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          key,
          endpoint,
        });
      });

    return originalJson(body);
  };

  next();
}

async function pollAndReturnCachedResponse(
  key: string,
  endpoint: string,
  res: Response
): Promise<void> {
  const db = getDb();
  const MAX_ATTEMPTS = 30; // 3 seconds max (30 x 100ms)
  const POLL_INTERVAL_MS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await db('idempotency_keys')
      .where({ key, endpoint })
      .first();

    if (existing && existing.status_code !== 0 && existing.response_body !== null) {
      logger.info(`Idempotency cache hit via polling`, { key, endpoint });
      const body = typeof existing.response_body === 'string'
        ? JSON.parse(existing.response_body)
        : existing.response_body;
      res.status(existing.status_code).json(body);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  logger.warn(`Idempotency race conflict`, { key, endpoint });
  res.status(409).json({
    success: false,
    error: 'Concurrent request with the same idempotency key is still in progress',
    code: 'CONFLICT',
    timestamp: new Date().toISOString(),
  });
}
