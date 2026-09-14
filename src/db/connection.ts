// ============================================================
//  DATABASE CONNECTION — Shared Knex Instance
// ============================================================
//
//  DB_DRIVER environment variable (required in production):
//    postgres  — (default when unset) Connect to PostgreSQL. If the
//                connection fails, the process exits with a fatal error.
//                There is NO automatic fallback to SQLite.
//    sqlite    — Connect to a local SQLite file. For local dev and
//                lightweight unit tests ONLY. Refused in production.
//
//  PRODUCTION GUARD:
//    If NODE_ENV === 'production' and DB_DRIVER is anything other than
//    'postgres', startup is refused immediately with a clear error.
//
//  WHY NO FALLBACK:
//    A silent fallback to SQLite in production would cause a PostgreSQL
//    outage to silently switch the entire application to a throwaway
//    local file, losing all transactional guarantees and making the
//    outage invisible to monitoring. The only safe behaviour is to
//    crash loudly and let the orchestration layer (k8s, systemd, etc.)
//    restart and alert.
// ============================================================

import knex, { Knex } from 'knex';
import pgConfig from './knexfile';
import { logger } from '../utils/logger';
import path from 'path';

let db: Knex;

// ── Driver resolution ──────────────────────────────────────────
type DbDriver = 'postgres' | 'sqlite';

function resolveDriver(): DbDriver {
  const raw = (process.env.DB_DRIVER ?? 'postgres').trim().toLowerCase();
  if (raw === 'postgres' || raw === 'sqlite') return raw as DbDriver;
  throw new Error(
    `DB_DRIVER must be 'postgres' or 'sqlite', got '${raw}'. ` +
      `Set DB_DRIVER=postgres for production/integration testing, ` +
      `or DB_DRIVER=sqlite for lightweight unit tests.`
  );
}

function buildSqliteConfig(): Knex.Config {
  return {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '..', '..', 'globalpay.sqlite'),
    },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
    migrations: {
      directory: path.join(__dirname, '..', '..', 'migrations'),
      extension: 'ts',
    },
  };
}

/**
 * Initialize the database connection and run pending migrations.
 * Must be called once at server startup before any DB operations.
 *
 * Throws a hard error if:
 *   - DB_DRIVER=postgres (or unset) and PostgreSQL is unreachable.
 *   - NODE_ENV=production and DB_DRIVER is not 'postgres'.
 */
export async function initDatabase(): Promise<Knex> {
  if (db) return db;

  const driver = resolveDriver();

  // ── Production guard ─────────────────────────────────────────
  if (process.env.NODE_ENV === 'production' && driver !== 'postgres') {
    throw new Error(
      `FATAL: DB_DRIVER='${driver}' is not allowed in production. ` +
        `Only DB_DRIVER=postgres is permitted when NODE_ENV=production. ` +
        `SQLite is for local dev and unit tests only.`
    );
  }

  if (driver === 'sqlite') {
    logger.warn(
      `DB_DRIVER=sqlite — connecting to local SQLite file. ` +
        `This is for lightweight unit tests and local dev ONLY. ` +
        `Never use SQLite in production or for money-path integration tests.`
    );
    db = knex(buildSqliteConfig());
    await db.raw('SELECT 1');
    logger.success('Database connection established (SQLite — dev/test only)');
  } else {
    // driver === 'postgres' (default)
    try {
      db = knex(pgConfig);
      await db.raw('SELECT 1');
      logger.success('Database connection established (PostgreSQL)');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Hard failure — no SQLite fallback.
      logger.error(
        `FATAL: PostgreSQL connection failed. ` +
          `GlobalPay requires a running PostgreSQL instance. ` +
          `Configure DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD. ` +
          `To run lightweight unit tests against SQLite instead, set DB_DRIVER=sqlite ` +
          `(but money-path integration tests must use PostgreSQL). ` +
          `Error: ${message}`
      );
      throw new Error(`POSTGRES_CONNECTION_FAILED: ${message}`);
    }
  }

  // ── Run pending migrations ────────────────────────────────────
  try {
    const [batchNo, migrations] = await db.migrate.latest();
    if (migrations.length > 0) {
      logger.info(`Ran ${migrations.length} migration(s) in batch ${batchNo}`, {
        migrations,
      });
    } else {
      logger.debug('No pending migrations');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Migration failed', { error: message });
    throw new Error(`MIGRATION_FAILED: ${message}`);
  }

  return db;
}

/**
 * Get the active Knex instance.
 * Throws if initDatabase() has not been called.
 */
export function getDb(): Knex {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Returns true if the database has been initialized.
 * Useful for test guards that need to skip if DB is not available.
 */
export function isDatabaseInitialized(): boolean {
  return !!db;
}

/**
 * Returns the active DB driver ('postgres' | 'sqlite').
 * Safe to call before initDatabase() — reads the env var directly.
 */
export function getActiveDriver(): DbDriver {
  return resolveDriver();
}

/**
 * Gracefully close the database connection pool.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    (db as any) = undefined;
    logger.info('Database connection closed');
  }
}
