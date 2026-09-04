// ============================================================
//  KNEX CONFIGURATION — PostgreSQL Connection Settings
// ============================================================
//
//  Environment variables:
//    DATABASE_URL  — full connection string (takes precedence)
//    DB_HOST       — default: localhost
//    DB_PORT       — default: 5432
//    DB_NAME       — default: globalpay
//    DB_USER       — default: postgres
//    DB_PASSWORD   — default: postgres
// ============================================================

import type { Knex } from 'knex';
import path from 'path';

const connection: Knex.PgConnectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 }
  : {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'globalpay',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      connectionTimeoutMillis: 2000,
    };

const config: Knex.Config = {
  client: 'pg',
  connection,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(__dirname, '..', '..', 'migrations'),
    extension: 'ts',
  },
};

export default config;
