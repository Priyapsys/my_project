// ============================================================
//  VALIDATION MIDDLEWARE — Zod Request Body Validator
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * Rejects invalid payloads with HTTP 400 and code 'VALIDATION'.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const issues = result.error.issues;
      const firstIssue = issues[0];
      const errorMessage = firstIssue ? firstIssue.message : 'Invalid request payload';

      const details = issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'VALIDATION',
        details,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
