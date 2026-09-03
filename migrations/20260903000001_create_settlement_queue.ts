import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('settlement_queue', (table) => {
    table.uuid('id').primary();
    table.string('tx_id', 100).notNullable().unique();
    table.string('sender', 100).notNullable();
    table.string('receiver', 100).notNullable();
    table.decimal('original_amount', 18, 4).notNullable();
    table.decimal('converted_amount', 18, 4).notNullable();
    table.string('source_currency', 10).notNullable();
    table.string('dest_currency', 10).notNullable();
    table.decimal('rate', 18, 8).notNullable();
    table.integer('compliance_score').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('batch_id', 100).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true }).nullable();

    table.index(['status', 'created_at'], 'idx_settlement_queue_status_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('settlement_queue');
}
