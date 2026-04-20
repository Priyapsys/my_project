// ============================================================
//  SERVER.TS — Express Application Entry Point
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import { logger } from './utils/logger';

// ── Routes ──────────────────────────────────────────────────
import authRoute       from './routes/auth';
import kycRoute        from './routes/kyc';
import transferRoute   from './routes/transfer';
import settlementRoute from './routes/settlement';
import balanceRoute    from './routes/balance';
import txRoute         from './routes/transactions';

// ── Modules ─────────────────────────────────────────────────
import { seedBalances }    from './modules/ledger';
import { seedReserves }    from './modules/treasury';
import { seedKyc }         from './middleware/kyc';
import { issueToken }      from './middleware/auth';

// ============================================================
//  SEED DATA — Initial state for demo
// ============================================================

function seed(): void {
  logger.banner('Seeding Initial System State');

  // Users
  const USERS = ['alice', 'bob', 'charlie', 'diana', 'eve'];

  // Pre-issue tokens (so demo scripts don't need to log in)
  USERS.forEach((u) => {
    issueToken(u);
    logger.info(`Token pre-issued for: ${u} → token-${u}`);
  });

  // KYC — all seed users are pre-verified
  seedKyc(USERS);

  // Ledger balances
  seedBalances([
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

  // Treasury reserves (system liquidity)
  seedReserves({
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

// ── Core Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ───────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`→ ${req.method} ${req.path}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/login',       authRoute);
app.use('/api/kyc',         kycRoute);
app.use('/api/transfer',    transferRoute);
app.use('/api/settlement',  settlementRoute);
app.use('/api/balance',     balanceRoute);
app.use('/api/transactions', txRoute);

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Global Payment System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Index ────────────────────────────────────────────────
app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'Real-Time Global Payment System with Blockchain Settlement',
    version: '1.0.0',
    endpoints: {
      auth:        'POST /api/login',
      kyc:         'POST /api/kyc/submit | POST /api/kyc/address | POST /api/kyc/face | GET /api/kyc/status',
      transfer:    'POST /api/transfer',
      settlement:  'POST /api/settlement/run | GET /api/settlement/status | GET /api/settlement/history',
      balance:     'GET /api/balance/:userId | GET /api/balance',
      transactions:'GET /api/transactions/:userId',
      health:      'GET /health',
    },
    seedUsers: ['alice', 'bob', 'charlie', 'diana', 'eve'],
    note: 'All seed users are pre-authenticated. Use token-{userId} as Bearer token.',
  });
});

// ── 404 Handler ──────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
  });
});

// ── Global Error Handler ─────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
//  START
// ============================================================

seed();

app.listen(PORT, () => {
  logger.success(`Server running on http://localhost:${PORT}`);
  logger.info(`API index: http://localhost:${PORT}/api`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

export default app;
