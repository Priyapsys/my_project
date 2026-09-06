import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('withdrawal_requests', (table) => {
    table.string('id').primary();
    table.string('user_id').notNullable();
    table.decimal('amount', 14, 4).notNullable();
    table.string('currency').notNullable().defaultTo('USD');
    table.string('stripe_transfer_id').nullable();
    table.string('status').notNullable().defaultTo('pending'); // pending | completed | failed
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index(['user_id', 'currency', 'status']);
    table.index(['stripe_transfer_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('withdrawal_requests');
}
