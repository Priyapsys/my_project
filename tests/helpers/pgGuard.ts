// ============================================================
//  INTEGRATION TEST — PostgreSQL GUARD
// ============================================================
//
//  Usage: import { describePg, withPostgresLifecycle, isPostgres } from '../helpers/pgGuard';
//
//  Money-path integration tests (ledger, concurrency, idempotency,
//  settlement) MUST run against real PostgreSQL. Allowing them to
//  silently pass against SQLite would give false confidence: SQLite
//  lacks FOR UPDATE SKIP LOCKED, serializable isolation, and NUMERIC
//  precision semantics that the production code depends on.
//
//  This guard prints a clear console message and skips the suite
//  when DB_DRIVER !== 'postgres'. It does NOT silently pass.
// ============================================================

import { initDatabase, closeDatabase } from '../../src/db/connection';

/**
 * Returns true when running against PostgreSQL.
 */
export function isPostgres(): boolean {
  return (process.env.DB_DRIVER ?? 'postgres') === 'postgres';
}

/**
 * Conditional describe block that skips the suite when DB_DRIVER !== 'postgres'.
 * Prints a clear warning message explaining why the suite was skipped.
 */
export const describePg = (suiteName: string, fn: () => void): void => {
  const driver = process.env.DB_DRIVER ?? 'postgres';
  const isPg = driver === 'postgres';

  if (!isPg) {
    describe.skip(`[SKIPPED - requires DB_DRIVER=postgres] ${suiteName}`, () => {
      beforeAll(() => {
        console.warn(
          `\n⚠️  SKIP: [${suiteName}] requires DB_DRIVER=postgres.\n` +
            `   Current driver: '${driver}'\n` +
            `   Re-run with: DB_DRIVER=postgres npx jest\n`
        );
      });
      fn();
    });
    return;
  }

  describe(suiteName, fn);
};

/**
 * Standard integration test database lifecycle hooks.
 * Initializes PG on beforeAll, closes on afterAll.
 * If DB_DRIVER !== 'postgres', the hook does nothing (handled by describePg).
 * If PG is configured but unreachable, it FAILS LOUDLY (throws error).
 *
 * @param suiteName  Human-readable suite name shown in error messages.
 * @param setup      Optional additional setup to run after DB init.
 */
export function withPostgresLifecycle(
  suiteName: string,
  setup?: () => Promise<void>
): void {
  const driver = process.env.DB_DRIVER ?? 'postgres';
  const isPg = driver === 'postgres';

  beforeAll(async () => {
    if (!isPg) return;

    try {
      await initDatabase();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `\n❌  FATAL: [${suiteName}] could not connect to PostgreSQL.\n` +
          `   Error: ${message}\n` +
          `   Ensure PostgreSQL is running and DATABASE_URL / DB_HOST etc. are set.\n`
      );
      throw err;
    }

    if (setup) await setup();
  });

  afterAll(async () => {
    if (!isPg) return;
    try {
      await closeDatabase();
    } catch (_) {}
  });
}
