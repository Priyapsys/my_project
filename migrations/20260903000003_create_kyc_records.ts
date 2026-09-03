import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('kyc_records', (table) => {
    table.string('user_id', 100).primary();
    table.string('status', 20).notNullable().defaultTo('PENDING');
    table.string('id_type', 50).nullable();
    table.string('id_number', 100).nullable();
    table.boolean('document_uploaded').notNullable().defaultTo(false);
    table.boolean('address_proof_uploaded').notNullable().defaultTo(false);
    table.boolean('face_verified').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('verified_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kyc_records');
}
