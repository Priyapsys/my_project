import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('withdrawal_requests');
  if (hasTable) {
    const hasCol = await knex.schema.hasColumn('withdrawal_requests', 'stripe_idempotency_key');
    if (!hasCol) {
      await knex.schema.alterTable('withdrawal_requests', (table) => {
        table.string('stripe_idempotency_key', 255).nullable();
      });
    }

    // Migrate existing pending records to created
    await knex('withdrawal_requests')
      .where({ status: 'pending' })
      .update({ status: 'created' });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('withdrawal_requests');
  if (hasTable) {
    const hasCol = await knex.schema.hasColumn('withdrawal_requests', 'stripe_idempotency_key');
    if (hasCol) {
      await knex.schema.alterTable('withdrawal_requests', (table) => {
        table.dropColumn('stripe_idempotency_key');
      });
    }
  }
}
