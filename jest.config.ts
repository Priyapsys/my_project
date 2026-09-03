// ============================================================
//  JEST CONFIGURATION
// ============================================================

import type { Config } from 'jest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';

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
