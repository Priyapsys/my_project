// ============================================================
//  MIGRATION 001 — Core Tables for Persistent Ledger
// ============================================================
//
//  Tables created:
//    accounts          — Current balance per (user, currency) pair
//    transactions      — Append-only transaction log (audit trail)
//    treasury_reserves — System liquidity pool balances
//    idempotency_keys  — Cached responses for write endpoint replays
//
//  Design decision: MAINTAINED BALANCES (not derived)
//  ──────────────────────────────────────────────────
//  We store the current balance in `accounts.balance` and update it
//  transactionally on every debit/credit. The alternative — deriving
//  balances by summing the transactions table — would require scanning
//  every row for a user on every balance check, which is O(N) per read
//  and unacceptable for the critical path (balance validation before
//  transfer). Maintained balances are O(1) reads and are the standard
//  approach in financial systems. The append-only `transactions` table
//  serves as the immutable audit log for reconciliation.
//
//  Concurrency is handled via SELECT FOR UPDATE on the account row
//  inside a database transaction, serializing concurrent balance
//  mutations at the row level.
// ============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── accounts ──────────────────────────────────────────────
  await knex.schema.createTable('accounts', (table) => {
    table.increments('id').primary();
    table.string('user_id', 100).notNullable();
    table.string('currency', 10).notNullable();
    table.decimal('balance', 18, 4).notNullable().defaultTo(0);
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'currency']);
    table.index(['user_id'], 'idx_accounts_user_id');
  });

  // ── transactions (append-only) ────────────────────────────
  await knex.schema.createTable('transactions', (table) => {
    table.increments('id').primary();
    table.string('tx_id', 100).notNullable().unique();
    table.string('sender', 100).notNullable();
    table.string('receiver', 100).notNullable();
    table.decimal('original_amount', 18, 4).notNullable();
    table.decimal('converted_amount', 18, 4).notNullable();
    table.string('source_currency', 10).notNullable();
    table.string('dest_currency', 10).notNullable();
    table.decimal('rate', 18, 8).notNullable();
    table.integer('compliance_score').notNullable();
    table.string('status', 20).notNullable().defaultTo('completed');
    table.string('batch_id', 100).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['sender'], 'idx_transactions_sender');
    table.index(['receiver'], 'idx_transactions_receiver');
    table.index(['batch_id'], 'idx_transactions_batch_id');
  });

  // ── treasury_reserves ─────────────────────────────────────
  await knex.schema.createTable('treasury_reserves', (table) => {
    table.increments('id').primary();
    table.string('currency', 10).notNullable().unique();
    table.decimal('amount', 18, 4).notNullable().defaultTo(0);
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── idempotency_keys ──────────────────────────────────────
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.increments('id').primary();
    table.string('key', 255).notNullable();
    table.string('endpoint', 255).notNullable();
    table.integer('status_code').notNullable();
    table.jsonb('response_body').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['key', 'endpoint']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('treasury_reserves');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('accounts');
}
