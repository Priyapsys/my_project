// ============================================================
//  JEST CONFIGURATION
// ============================================================
//
//  DB_DRIVER default for tests:
//    Unit tests (tests/unit/**) run against SQLite by default —
//    they are fast, isolated, and do not require PostgreSQL.
//
//    Integration tests (tests/integration/**) REQUIRE PostgreSQL.
//    Each integration test suite includes a beforeAll guard that
//    checks DB_DRIVER === 'postgres'. If Postgres is not configured,
//    the suite skips with a clear console message rather than silently
//    passing against the wrong backend.
//
//    To run integration tests:
//      DB_DRIVER=postgres npx jest tests/integration
//
//    To run unit tests (no PG needed):
//      npx jest tests/unit
//      (or DB_DRIVER=sqlite npx jest tests/unit)
// ============================================================

import type { Config } from 'jest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';

// Default to SQLite for unit tests. Integration tests override this explicitly
// or rely on the suite-level PG guard defined in tests/helpers/pgGuard.ts.
if (!process.env.DB_DRIVER) {
  process.env.DB_DRIVER = 'sqlite';
}

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Give DB operations generous timeouts
  testTimeout: 30000,
  // Ensure clean state between test files
  forceExit: true,
  detectOpenHandles: true,
};

export default config;
