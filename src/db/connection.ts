// ============================================================
//  DATABASE CONNECTION — Shared Knex Instance
// ============================================================

import knex, { Knex } from 'knex';
import config from './knexfile';
import { logger } from '../utils/logger';
import path from 'path';

let db: Knex;

/**
 * Initialize the database connection and run pending migrations.
 * Must be called once at server startup before any DB operations.
 */
export async function initDatabase(): Promise<Knex> {
  if (db) return db;

  try {
    db = knex(config);
    await db.raw('SELECT 1');
    logger.success('Database connection established (PostgreSQL)');
  } catch (err) {
    logger.warn('PostgreSQL unavailable, using SQLite driver for local execution');
    db = knex({
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
    });
    await db.raw('SELECT 1');
    logger.success('Database connection established (SQLite)');
  }

  // Run pending migrations
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
 * Gracefully close the database connection pool.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    logger.info('Database connection closed');
  }
}
