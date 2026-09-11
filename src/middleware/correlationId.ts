// ============================================================
//  CORRELATION ID MIDDLEWARE — Request Tracing for GlobalPay
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext } from '../utils/logger';

/**
 * Middleware that extracts incoming X-Request-Id or generates a new UUID v4.
 * Attaches the requestId to req.requestId, sets the X-Request-Id response header,
 * and enters an AsyncLocalStorage context so all downstream logs automatically
 * include the requestId.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingHeader = req.headers['x-request-id'];
  const requestId =
    typeof incomingHeader === 'string' && incomingHeader.trim().length > 0
      ? incomingHeader.trim()
      : uuidv4();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
}
