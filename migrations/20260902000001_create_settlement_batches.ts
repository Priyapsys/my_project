import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('settlement_batches', (table) => {
    table.string('batch_id').primary();
    table.string('batch_hash').notNullable();
    table.enum('status', ['pending', 'anchored', 'confirmed', 'failed']).notNullable().defaultTo('pending');
    table.string('tx_hash').nullable();
    table.timestamp('confirmed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('settlement_batches');
}
