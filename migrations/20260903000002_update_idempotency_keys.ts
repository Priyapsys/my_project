import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('idempotency_keys');
  if (hasTable) {
    await knex.schema.alterTable('idempotency_keys', (table) => {
      table.jsonb('response_body').nullable().alter();
    });
  } else {
    await knex.schema.createTable('idempotency_keys', (table) => {
      table.increments('id').primary();
      table.string('key', 255).notNullable();
      table.string('endpoint', 255).notNullable();
      table.integer('status_code').notNullable();
      table.jsonb('response_body').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['key', 'endpoint']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // no-op
}
