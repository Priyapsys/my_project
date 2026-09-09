// ============================================================
//  SERVER.TS — Express Application Entry Point
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from './utils/logger';

// ── Database ────────────────────────────────────────────────
import { initDatabase, closeDatabase } from './db/connection';

// ── Routes ──────────────────────────────────────────────────
import authRoute       from './routes/auth';
import kycRoute        from './routes/kyc';
import transferRoute   from './routes/transfer';
import settlementRoute from './routes/settlement';
import balanceRoute    from './routes/balance';
import txRoute         from './routes/transactions';
import testRoute       from './routes/test';
import depositRoute    from './routes/deposit';
import withdrawRoute   from './routes/withdraw';
import webhookRoute    from './routes/webhooks';

// ── Modules ─────────────────────────────────────────────────
import { seedBalances }    from './modules/ledger';
import { seedReserves }    from './modules/treasury';
import { seedKyc }         from './middleware/kyc';

// ============================================================
//  SEED DATA — Initial state for demo
// ============================================================

async function seed(): Promise<void> {
  logger.banner('Seeding Initial System State');

  // Users
  const USERS = ['alice', 'bob', 'charlie', 'diana', 'eve'];

  // JWT auth is stateless — no pre-issued tokens needed.
  // Seed users must POST /api/login { "userId": "alice" } to get a JWT.
  logger.info(`Seed users: ${USERS.join(', ')} — login via POST /api/login`);

  // KYC — all seed users are pre-verified
  await seedKyc(USERS);

  // Ledger balances (now async — writes to PostgreSQL)
  await seedBalances([
    { userId: 'alice',   currency: 'USD', amount: 10_000 },
    { userId: 'alice',   currency: 'GBP', amount: 2_000  },
    { userId: 'bob',     currency: 'INR', amount: 500_000 },
    { userId: 'bob',     currency: 'USD', amount: 1_000  },
    { userId: 'charlie', currency: 'USD', amount: 5_000  },
    { userId: 'charlie', currency: 'EUR', amount: 3_000  },
    { userId: 'diana',   currency: 'AED', amount: 50_000 },
    { userId: 'diana',   currency: 'INR', amount: 200_000 },
    { userId: 'eve',     currency: 'GBP', amount: 8_000  },
    { userId: 'eve',     currency: 'JPY', amount: 1_000_000 },
  ]);

  // Treasury reserves (now async — writes to PostgreSQL)
  await seedReserves({
    USD: 1_000_000,
    INR: 50_000_000,
    GBP: 500_000,
    EUR: 800_000,
    AED: 2_000_000,
    JPY: 80_000_000,
  });

  logger.banner('System Ready');
}

// ============================================================
//  APP SETUP
// ============================================================

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const configuredOrigins = (process.env.CORS_ORIGINS ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');

// ── Request identity + security headers + CORS ───────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const supplied = req.headers['x-correlation-id'];
  const correlationId = typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID();

  res.locals.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const origin = req.headers.origin;
  if (origin) {
    if (!configuredOrigins.includes(origin)) {
      res.status(403).json({
        success: false,
        error: 'Origin is not allowed',
        code: 'CORS_ORIGIN_NOT_ALLOWED',
        correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, Stripe-Signature, X-Correlation-Id');
    res.status(204).end();
    return;
  }

  next();
});

// ── Stripe Webhook (raw body — MUST be before express.json()) ─
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoute);

// ── Core Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ───────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`→ ${req.method} ${req.path}`, { correlationId: res.locals.correlationId });
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/login',       authRoute);
app.use('/api/kyc',         kycRoute);
app.use('/api/transfer',    transferRoute);
app.use('/api/settlement',  settlementRoute);
app.use('/api/balance',     balanceRoute);
app.use('/api/transactions', txRoute);
app.use('/api/test',         testRoute);
app.use('/api/deposit',      depositRoute);
app.use('/api/withdraw',     withdrawRoute);

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Global Payment System',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Index ────────────────────────────────────────────────
app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'Real-Time Global Payment System with Blockchain Settlement',
    version: '1.1.0',
    endpoints: {
      auth:        'POST /api/login',
      kyc:         'POST /api/kyc/submit | POST /api/kyc/address | POST /api/kyc/face | GET /api/kyc/status',
      transfer:    'POST /api/transfer  (requires Idempotency-Key header)',
      deposit:     'POST /api/deposit',
      withdraw:    'POST /api/withdraw',
      settlement:  'POST /api/settlement/run (requires Idempotency-Key header) | GET /api/settlement/status | GET /api/settlement/history',
      balance:     'GET /api/balance/:userId | GET /api/balance',
      transactions:'GET /api/transactions/:userId',
      health:      'GET /health',
    },
    seedUsers: ['alice', 'bob', 'charlie', 'diana', 'eve'],
    note: 'POST /api/login with { "userId": "<name>" } to get a JWT. Use it as: Authorization: Bearer <jwt>. Write endpoints require Idempotency-Key header.',
  });
});

// ── 404 Handler ──────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    correlationId: res.locals.correlationId,
    timestamp: new Date().toISOString(),
  });
});

// ── Global Error Handler ─────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack, correlationId: res.locals.correlationId });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    correlationId: res.locals.correlationId,
    timestamp: new Date().toISOString(),
  });
});

import { reconcilePendingBatches } from './services/blockchainService';

// ============================================================
//  START — Initialize DB, run migrations, seed, then listen
// ============================================================

async function start(): Promise<void> {
  try {
    // Initialize database connection + run migrations
    await initDatabase();

    // Seed demo data (idempotent thanks to ON CONFLICT)
    await seed();

    // Start reconciliation worker every 5 minutes
    setInterval(async () => {
      try {
        const result = await reconcilePendingBatches();
        logger.info('Reconciliation worker completed', result);
      } catch (err) {
        logger.error('Reconciliation worker failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 5 * 60 * 1000);

    app.listen(PORT, () => {
      logger.success(`Server running on http://localhost:${PORT}`);
      logger.info(`API index: http://localhost:${PORT}/api`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      if (process.env.NODE_ENV === 'production') {
        logger.info('Demo mode: DISABLED (NODE_ENV=production)');
      } else {
        logger.warn(
          `Demo mode: ENABLED (NODE_ENV=${process.env.NODE_ENV || 'development'}) — deposit bypass reachable via ?demo=true`
        );
      }
    });
  } catch (err) {
    logger.error('Failed to start server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing database...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Closing database...');
  await closeDatabase();
  process.exit(0);
});

if (require.main === module) {
  start();
}

export default app;
