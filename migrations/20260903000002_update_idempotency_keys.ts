import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('idempotency_keys');
  if (hasTable) {
    await knex.schema.alterTable('idempotency_keys', (table) => {
      table.jsonb('response_body').nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // no-op
}
