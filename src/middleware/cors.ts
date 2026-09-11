// ============================================================
//  CORS MIDDLEWARE — Origin Whitelist Configuration
// ============================================================

import cors, { CorsOptions } from 'cors';

/**
 * Returns allowed origins from the ALLOWED_ORIGINS environment variable.
 * Fallbacks to localhost Vite frontend & backend ports if unset.
 */
export function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS;
  if (!envOrigins) {
    return ['http://localhost:5173', 'http://localhost:3000'];
  }
  return envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests without Origin header (e.g. curl, test suites, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'X-Request-Id',
    'X-Test-Rate-Limit',
  ],
  exposedHeaders: ['X-Request-Id'],
};

export const corsMiddleware = cors(corsOptions);
