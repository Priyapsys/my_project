import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('processed_webhooks', (table) => {
    table.string('id').primary();
    table.string('event_type').notNullable();
    table.string('source_id').notNullable();
    table.timestamp('processed_at').defaultTo(knex.fn.now());
    table.unique(['event_type', 'source_id']);
    table.index(['source_id']);
    table.index(['event_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('processed_webhooks');
}
