// ============================================================
//  DATABASE CONNECTION — Shared Knex Instance
// ============================================================

import knex, { Knex } from 'knex';
import config from './knexfile';
import { logger } from '../utils/logger';

let db: Knex;

/**
 * Initialize the database connection and run pending migrations.
 * Must be called once at server startup before any DB operations.
 */
export async function initDatabase(): Promise<Knex> {
  if (db) return db;

  db = knex(config);

  // Verify connectivity
  try {
    await db.raw('SELECT 1');
    logger.success('Database connection established');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Database connection failed', { error: message });
    throw new Error(`DB_CONNECTION_FAILED: ${message}`);
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
