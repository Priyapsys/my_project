import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop old idempotency_keys table if it exists
  await knex.schema.dropTableIfExists('idempotency_keys');

  // Recreate with robust schema
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.increments('id').primary();
    table.string('user_id', 255).notNullable();
    table.string('route', 255).notNullable();
    table.string('idempotency_key', 255).notNullable();
    table.string('request_hash', 64).notNullable();
    table.string('status', 32).notNullable().defaultTo('pending'); // 'pending' | 'succeeded' | 'failed'
    table.integer('response_status').nullable();
    table.text('response_body').nullable();
    table.string('resource_id', 255).nullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'route', 'idempotency_key']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('idempotency_keys');
}
