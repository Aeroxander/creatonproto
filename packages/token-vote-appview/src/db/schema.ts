import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

export interface TokenVoteTable {
    uri: string
    cid: string
    voter_did: string
    wallet_address: string
    subject_uri: string
    subject_cid: string
    token_contract: string
    claimed_amount: string
    chain_id: number
    direction: number
    signature: Buffer
    created_at: string
    indexed_at: string
}

export interface TokenVoteWeightTable {
    vote_uri: string
    snapshot_date: string
    verified_balance: string
    effective_weight: string
    holding_days: number
}

export interface Database {
    token_vote: TokenVoteTable
    token_vote_weight: TokenVoteWeightTable
}

export function createDb(dbPath: string): Kysely<Database> {
    const dialect = new SqliteDialect({
        database: new Database(dbPath),
    })

    return new Kysely<Database>({ dialect })
}

export async function migrateDb(db: Kysely<Database>): Promise<void> {
    // Create token_vote table
    await db.schema
        .createTable('token_vote')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('cid', 'text', (col) => col.notNull())
        .addColumn('voter_did', 'text', (col) => col.notNull())
        .addColumn('wallet_address', 'text', (col) => col.notNull())
        .addColumn('subject_uri', 'text', (col) => col.notNull())
        .addColumn('subject_cid', 'text', (col) => col.notNull())
        .addColumn('token_contract', 'text', (col) => col.notNull())
        .addColumn('claimed_amount', 'text', (col) => col.notNull())
        .addColumn('chain_id', 'integer', (col) => col.notNull())
        .addColumn('direction', 'integer', (col) => col.notNull())
        .addColumn('signature', 'blob', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    // Create unique constraint on voter_did + subject_uri
    await db.schema
        .createIndex('idx_token_vote_unique')
        .ifNotExists()
        .on('token_vote')
        .columns(['voter_did', 'subject_uri'])
        .unique()
        .execute()

    // Create index on subject_uri for efficient lookups
    await db.schema
        .createIndex('idx_token_vote_subject')
        .ifNotExists()
        .on('token_vote')
        .column('subject_uri')
        .execute()

    // Create token_vote_weight table
    await db.schema
        .createTable('token_vote_weight')
        .ifNotExists()
        .addColumn('vote_uri', 'text', (col) => col.notNull())
        .addColumn('snapshot_date', 'text', (col) => col.notNull())
        .addColumn('verified_balance', 'text', (col) => col.notNull())
        .addColumn('effective_weight', 'text', (col) => col.notNull())
        .addColumn('holding_days', 'integer', (col) => col.notNull().defaultTo(0))
        .addPrimaryKeyConstraint('pk_vote_weight', ['vote_uri', 'snapshot_date'])
        .execute()

    // Add holding_days column to existing tables (idempotent migration)
    try {
        await db.schema
            .alterTable('token_vote_weight')
            .addColumn('holding_days', 'integer', (col) => col.notNull().defaultTo(0))
            .execute()
    } catch { /* column already exists */ }

    // Create index on snapshot_date
    await db.schema
        .createIndex('idx_vote_weight_date')
        .ifNotExists()
        .on('token_vote_weight')
        .column('snapshot_date')
        .execute()
}
