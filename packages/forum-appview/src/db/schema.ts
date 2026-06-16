import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

export interface ForumBoardTable {
    uri: string
    title: string
    description: string | null
    indexed_at: string
}

export interface ForumTopicTable {
    uri: string
    board_uri: string
    author_did: string
    title: string
    body: string | null
    created_at: string
    indexed_at: string
}

export interface ForumCommentTable {
    uri: string
    topic_uri: string
    author_did: string
    body: string
    created_at: string
    indexed_at: string
}

export interface ForumVoteTable {
    uri: string
    voter_did: string
    subject_uri: string
    author_did: string
    subject_kind: 'topic' | 'comment'
    direction: 'up' | 'down'
    created_at: string
    indexed_at: string
}

export interface ForumMemberTable {
    uri: string
    user_did: string
    board_uri: string
    created_at: string
    indexed_at: string
}

export interface ForumFollowTable {
    follower_did: string
    subject_did: string
    indexed_at: string
}

export interface ForumPagerankTable {
    did: string
    score: number
    updated_at: string
}

export interface ForumKarmaTable {
    did: string
    post_karma: number
    comment_karma: number
    total_karma: number
    updated_at: string
}

export interface ForumEmbeddingTable {
    uri: string
    kind: 'topic' | 'comment' | 'board'
    vector: Buffer
    indexed_at: string
}

export interface ForumEventTable {
    uri: string
    author_did: string
    board_uri: string | null
    name: string
    starts_at: string
    ends_at: string | null
    status: string | null
    mode: string | null
    indexed_at: string
}

export interface ForumEventRsvpTable {
    uri: string
    event_uri: string
    user_did: string
    status: string
    indexed_at: string
}

export interface Database {
    forum_board: ForumBoardTable
    forum_topic: ForumTopicTable
    forum_comment: ForumCommentTable
    forum_vote: ForumVoteTable
    forum_member: ForumMemberTable
    forum_follow: ForumFollowTable
    forum_pagerank: ForumPagerankTable
    forum_karma: ForumKarmaTable
    forum_embedding: ForumEmbeddingTable
    forum_event: ForumEventTable
    forum_event_rsvp: ForumEventRsvpTable
}

export function createDb(dbPath: string): Kysely<Database> {
    const dialect = new SqliteDialect({
        database: new Database(dbPath),
    })
    return new Kysely<Database>({ dialect })
}

export async function migrateDb(db: Kysely<Database>): Promise<void> {
    await db.schema
        .createTable('forum_board')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('description', 'text')
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_topic')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('author_did', 'text', (col) => col.notNull())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('body', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_comment')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('topic_uri', 'text', (col) => col.notNull())
        .addColumn('author_did', 'text', (col) => col.notNull())
        .addColumn('body', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_vote')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('voter_did', 'text', (col) => col.notNull())
        .addColumn('subject_uri', 'text', (col) => col.notNull())
        .addColumn('author_did', 'text', (col) => col.notNull())
        .addColumn('subject_kind', 'text', (col) => col.notNull())
        .addColumn('direction', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_vote_subject')
        .ifNotExists()
        .on('forum_vote')
        .column('subject_uri')
        .execute()

    await db.schema
        .createIndex('idx_forum_vote_author')
        .ifNotExists()
        .on('forum_vote')
        .column('author_did')
        .execute()

    await db.schema
        .createTable('forum_member')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('user_did', 'text', (col) => col.notNull())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_follow')
        .ifNotExists()
        .addColumn('follower_did', 'text', (col) => col.notNull())
        .addColumn('subject_did', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('pk_forum_follow', ['follower_did', 'subject_did'])
        .execute()

    await db.schema
        .createTable('forum_pagerank')
        .ifNotExists()
        .addColumn('did', 'text', (col) => col.primaryKey())
        .addColumn('score', 'real', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_karma')
        .ifNotExists()
        .addColumn('did', 'text', (col) => col.primaryKey())
        .addColumn('post_karma', 'real', (col) => col.notNull())
        .addColumn('comment_karma', 'real', (col) => col.notNull())
        .addColumn('total_karma', 'real', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_embedding')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('vector', 'blob', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_event')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('author_did', 'text', (col) => col.notNull())
        .addColumn('board_uri', 'text')
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('starts_at', 'text', (col) => col.notNull())
        .addColumn('ends_at', 'text')
        .addColumn('status', 'text')
        .addColumn('mode', 'text')
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_event_board')
        .ifNotExists()
        .on('forum_event')
        .column('board_uri')
        .execute()

    await db.schema
        .createIndex('idx_forum_event_starts')
        .ifNotExists()
        .on('forum_event')
        .column('starts_at')
        .execute()

    await db.schema
        .createTable('forum_event_rsvp')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('event_uri', 'text', (col) => col.notNull())
        .addColumn('user_did', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_event_rsvp_event')
        .ifNotExists()
        .on('forum_event_rsvp')
        .column('event_uri')
        .execute()
}
