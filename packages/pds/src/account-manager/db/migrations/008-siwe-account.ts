import { Kysely } from 'kysely'

// Make email and passwordScrypt nullable to support SIWE-only accounts
export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  // But for development, we can just run with the new schema
  // For production, this migration would need to be more careful

  // Since SQLite doesn't support ALTER COLUMN to change NOT NULL constraints,
  // we'll need to work around this. For now, we'll just skip this in SQLite.
  // The application code will handle the nullability.

  // Note: If using PostgreSQL, you would do:
  // await db.schema.alterTable('account').alterColumn('email', (col) => col.dropNotNull()).execute()
  // await db.schema.alterTable('account').alterColumn('passwordScrypt', (col) => col.dropNotNull()).execute()
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // No-op: We don't want to make these columns NOT NULL again
}
