import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

export interface ForumBoardTable {
    uri: string
    title: string
    description: string | null
    indexed_at: string
}

export interface ForumBoardAccessTable {
    board_uri: string
    issuer_did: string
    issuer_endpoint: string
    chain_id: number
    asset: string
    amount: string
    duration_seconds: number
    pay_to: string
    payment_protocol: 'mpp' | 'tempo' | null
    revenue_router: string | null
    committee_registry: string | null
    entitlement_registry: string | null
    committee_size: number | null
    committee_threshold: number | null
    history_policy: 'full' | 'window' | 'forward'
    epoch_seconds: number
    indexed_at: string
}

export interface ForumBoardRefTable {
    board_uri: string
    cid: string
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

export interface ForumProtectedRecordTable {
    uri: string
    board_uri: string
    topic_uri: string | null
    author_did: string
    kind: 'topic' | 'comment'
    encrypted_body: string
    epoch: string
    indexed_at: string
}

export interface ForumKeyCapsuleTable {
    uri: string
    board_uri: string
    record_uri: string
    committee_epoch: number
    policy_hash: string
    encapsulation: string
    created_at: string
    indexed_at: string
}

export interface IssuerNonceTable {
    nonce: string
    kind: 'service-jwt' | 'session'
    expires_at: string
    created_at: string
}

export interface ForumEntitlementTable {
    id: string
    board_uri: string
    did: string
    wallet_address: string
    starts_at: string
    expires_at: string
    source: 'mpp' | 'x402' | 'staff' | 'tempo'
    payment_ref: string | null
    created_at: string
}

export interface ForumEpochKeyTable {
    board_uri: string
    epoch: string
    encrypted_key: Buffer
    nonce: Buffer
    auth_tag: Buffer
    created_at: string
}

export interface ForumX402ReceiptTable {
    id: string
    board_uri: string
    did: string
    wallet_address: string
    network: string
    tx_hash: string | null
    amount: string
    asset: string
    pay_to: string
    status: 'pending' | 'settled' | 'failed'
    created_at: string
}

export interface ForumKeyGrantTable {
    grant_id: string
    uri: string | null
    board_uri: string
    did: string
    wallet_address: string
    session_key_hash: string
    certificate_hash: string
    epoch_from: string
    epoch_to: string
    expires_at: string
    status: 'issued' | 'published' | 'revoked'
    created_at: string
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

export interface ForumWalletLinkTable {
    uri: string
    did: string
    address: string
    chain_id: number
    cid: string | null
    issued_at: string
    indexed_at: string
}

export interface ForumWalletAttestationTable {
    uri: string
    did: string
    address: string
    cid: string | null
    version: number
    status: 'pending' | 'attested' | 'failed'
    trigger_tx: string | null
    created_at: string
    updated_at: string
}

export interface ForumReviewActionTable {
    uri: string
    cid: string | null
    board_uri: string
    subject_uri: string
    action: 'approve' | 'reject' | 'hide' | 'restore'
    moderator_did: string
    reason: string | null
    created_at: string
    indexed_at: string
}

export interface ForumSanctionTable {
    uri: string
    cid: string | null
    board_uri: string
    subject_did: string
    kind: 'mute' | 'ban' | 'postApproval'
    moderator_did: string
    reason: string | null
    expires_at: string | null
    revoked_at: string | null
    created_at: string
    indexed_at: string
}

export interface ForumRewardSnapshotTable {
    board_uri: string
    epoch_id: number
    starts_at: string
    ends_at: string
    cutoff_block: string
    record_uri: string
    record_cid: string
    dataset_hash: string
    merkle_root: string
    total_allocated: string
    allocation_count: number
    status: 'pending' | 'published'
    created_at: string
}

export interface ForumRewardAllocationTable {
    board_uri: string
    epoch_id: number
    did: string
    did_hash: string
    amount: string
    weight: number
    leaf: string
    proof: string
}

export interface ForumBillingProfileTable {
    did: string
    wallet_address: string
    crossmint_payment_method_id: string | null
    enrollment_status: 'not_started' | 'pending' | 'active'
    server_signer_authorized: number
    auto_renew_enabled: number
    billing_tier: 'auto' | 'manual'
    receipt_email: string | null
    updated_at: string
    created_at: string
}

export interface ForumRenewalJobTable {
    id: string
    board_uri: string
    did: string
    status: 'scheduled' | 'topping_up' | 'renewing' | 'completed' | 'failed'
    next_attempt_at: string
    last_error: string | null
    created_at: string
    updated_at: string
}

export interface Database {
    forum_board: ForumBoardTable
    forum_board_access: ForumBoardAccessTable
    forum_board_ref: ForumBoardRefTable
    forum_topic: ForumTopicTable
    forum_comment: ForumCommentTable
    forum_vote: ForumVoteTable
    forum_member: ForumMemberTable
    forum_follow: ForumFollowTable
    forum_pagerank: ForumPagerankTable
    forum_karma: ForumKarmaTable
    forum_embedding: ForumEmbeddingTable
    forum_protected_record: ForumProtectedRecordTable
    forum_key_capsule: ForumKeyCapsuleTable
    issuer_nonce: IssuerNonceTable
    forum_entitlement: ForumEntitlementTable
    forum_epoch_key: ForumEpochKeyTable
    forum_x402_receipt: ForumX402ReceiptTable
    forum_key_grant: ForumKeyGrantTable
    forum_event: ForumEventTable
    forum_event_rsvp: ForumEventRsvpTable
    forum_wallet_link: ForumWalletLinkTable
    forum_wallet_attestation: ForumWalletAttestationTable
    forum_review_action: ForumReviewActionTable
    forum_sanction: ForumSanctionTable
    forum_reward_snapshot: ForumRewardSnapshotTable
    forum_reward_allocation: ForumRewardAllocationTable
    forum_billing_profile: ForumBillingProfileTable
    forum_renewal_job: ForumRenewalJobTable
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
        .createTable('forum_board_access')
        .ifNotExists()
        .addColumn('board_uri', 'text', (col) => col.primaryKey())
        .addColumn('issuer_did', 'text', (col) => col.notNull())
        .addColumn('issuer_endpoint', 'text', (col) => col.notNull())
        .addColumn('chain_id', 'integer', (col) => col.notNull())
        .addColumn('asset', 'text', (col) => col.notNull())
        .addColumn('amount', 'text', (col) => col.notNull())
        .addColumn('duration_seconds', 'integer', (col) => col.notNull())
        .addColumn('pay_to', 'text', (col) => col.notNull())
        .addColumn('payment_protocol', 'text')
        .addColumn('revenue_router', 'text')
        .addColumn('committee_registry', 'text')
        .addColumn('entitlement_registry', 'text')
        .addColumn('committee_size', 'integer')
        .addColumn('committee_threshold', 'integer')
        .addColumn('history_policy', 'text', (col) => col.notNull())
        .addColumn('epoch_seconds', 'integer', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await ensureForumAccessColumns(db)

    await db.schema
        .createTable('forum_board_ref')
        .ifNotExists()
        .addColumn('board_uri', 'text', (col) => col.primaryKey())
        .addColumn('cid', 'text', (col) => col.notNull())
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
        .createTable('forum_protected_record')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('topic_uri', 'text')
        .addColumn('author_did', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('encrypted_body', 'text', (col) => col.notNull())
        .addColumn('epoch', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_protected_record_board')
        .ifNotExists()
        .on('forum_protected_record')
        .column('board_uri')
        .execute()

    await db.schema
        .createTable('forum_key_capsule')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('record_uri', 'text', (col) => col.notNull())
        .addColumn('committee_epoch', 'integer', (col) => col.notNull())
        .addColumn('policy_hash', 'text', (col) => col.notNull())
        .addColumn('encapsulation', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_key_capsule_board')
        .ifNotExists()
        .on('forum_key_capsule')
        .column('board_uri')
        .execute()

    await db.schema
        .createTable('issuer_nonce')
        .ifNotExists()
        .addColumn('nonce', 'text', (col) => col.primaryKey())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('expires_at', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_entitlement')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('wallet_address', 'text', (col) => col.notNull())
        .addColumn('starts_at', 'text', (col) => col.notNull())
        .addColumn('expires_at', 'text', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('payment_ref', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_entitlement_board_did')
        .ifNotExists()
        .on('forum_entitlement')
        .columns(['board_uri', 'did', 'expires_at'])
        .execute()

    await db.schema
        .createIndex('idx_forum_entitlement_board_wallet')
        .ifNotExists()
        .on('forum_entitlement')
        .columns(['board_uri', 'wallet_address', 'expires_at'])
        .execute()

    await db.schema
        .createTable('forum_epoch_key')
        .ifNotExists()
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('epoch', 'text', (col) => col.notNull())
        .addColumn('encrypted_key', 'blob', (col) => col.notNull())
        .addColumn('nonce', 'blob', (col) => col.notNull())
        .addColumn('auth_tag', 'blob', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('pk_forum_epoch_key', ['board_uri', 'epoch'])
        .execute()

    await db.schema
        .createTable('forum_x402_receipt')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('wallet_address', 'text', (col) => col.notNull())
        .addColumn('network', 'text', (col) => col.notNull())
        .addColumn('tx_hash', 'text', (col) => col.unique())
        .addColumn('amount', 'text', (col) => col.notNull())
        .addColumn('asset', 'text', (col) => col.notNull())
        .addColumn('pay_to', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_x402_receipt_board')
        .ifNotExists()
        .on('forum_x402_receipt')
        .columns(['board_uri', 'did'])
        .execute()

    await db.schema
        .createTable('forum_key_grant')
        .ifNotExists()
        .addColumn('grant_id', 'text', (col) => col.primaryKey())
        .addColumn('uri', 'text')
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('wallet_address', 'text', (col) => col.notNull())
        .addColumn('session_key_hash', 'text', (col) => col.notNull())
        .addColumn('certificate_hash', 'text', (col) => col.notNull())
        .addColumn('epoch_from', 'text', (col) => col.notNull())
        .addColumn('epoch_to', 'text', (col) => col.notNull())
        .addColumn('expires_at', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createIndex('idx_forum_key_grant_board_did')
        .ifNotExists()
        .on('forum_key_grant')
        .columns(['board_uri', 'did', 'expires_at'])
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

    await db.schema
        .createTable('forum_wallet_link')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('address', 'text', (col) => col.notNull())
        .addColumn('chain_id', 'integer', (col) => col.notNull())
        .addColumn('cid', 'text')
        .addColumn('issued_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema.createIndex('idx_forum_wallet_link_did')
        .ifNotExists().on('forum_wallet_link').column('did').execute()

    await db.schema
        .createTable('forum_wallet_attestation')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('address', 'text', (col) => col.notNull())
        .addColumn('cid', 'text')
        .addColumn('version', 'integer', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('trigger_tx', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema.createIndex('idx_forum_wallet_attestation_did')
        .ifNotExists().on('forum_wallet_attestation').column('did').execute()

    await db.schema
        .createTable('forum_review_action')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('cid', 'text')
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('subject_uri', 'text', (col) => col.notNull())
        .addColumn('action', 'text', (col) => col.notNull())
        .addColumn('moderator_did', 'text', (col) => col.notNull())
        .addColumn('reason', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema.createIndex('idx_forum_review_action_subject')
        .ifNotExists().on('forum_review_action').columns(['board_uri', 'subject_uri', 'created_at']).execute()

    await db.schema
        .createTable('forum_sanction')
        .ifNotExists()
        .addColumn('uri', 'text', (col) => col.primaryKey())
        .addColumn('cid', 'text')
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('subject_did', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('moderator_did', 'text', (col) => col.notNull())
        .addColumn('reason', 'text')
        .addColumn('expires_at', 'text')
        .addColumn('revoked_at', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('indexed_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema.createIndex('idx_forum_sanction_subject')
        .ifNotExists().on('forum_sanction').columns(['board_uri', 'subject_did', 'kind']).execute()

    await db.schema
        .createTable('forum_reward_snapshot')
        .ifNotExists()
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('epoch_id', 'integer', (col) => col.notNull())
        .addColumn('starts_at', 'text', (col) => col.notNull())
        .addColumn('ends_at', 'text', (col) => col.notNull())
        .addColumn('cutoff_block', 'text', (col) => col.notNull())
        .addColumn('record_uri', 'text', (col) => col.notNull())
        .addColumn('record_cid', 'text', (col) => col.notNull())
        .addColumn('dataset_hash', 'text', (col) => col.notNull())
        .addColumn('merkle_root', 'text', (col) => col.notNull())
        .addColumn('total_allocated', 'text', (col) => col.notNull())
        .addColumn('allocation_count', 'integer', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('pk_forum_reward_snapshot', ['board_uri', 'epoch_id'])
        .execute()

    await db.schema
        .createTable('forum_reward_allocation')
        .ifNotExists()
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('epoch_id', 'integer', (col) => col.notNull())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('did_hash', 'text', (col) => col.notNull())
        .addColumn('amount', 'text', (col) => col.notNull())
        .addColumn('weight', 'integer', (col) => col.notNull())
        .addColumn('leaf', 'text', (col) => col.notNull())
        .addColumn('proof', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('pk_forum_reward_allocation', ['board_uri', 'epoch_id', 'did'])
        .execute()

    await db.schema
        .createTable('forum_billing_profile')
        .ifNotExists()
        .addColumn('did', 'text', (col) => col.notNull().primaryKey())
        .addColumn('wallet_address', 'text', (col) => col.notNull())
        .addColumn('crossmint_payment_method_id', 'text')
        .addColumn('enrollment_status', 'text', (col) => col.notNull())
        .addColumn('server_signer_authorized', 'integer', (col) => col.notNull())
        .addColumn('auto_renew_enabled', 'integer', (col) => col.notNull())
        .addColumn('billing_tier', 'text', (col) => col.notNull())
        .addColumn('receipt_email', 'text')
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .execute()

    await db.schema
        .createTable('forum_renewal_job')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.notNull().primaryKey())
        .addColumn('board_uri', 'text', (col) => col.notNull())
        .addColumn('did', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('next_attempt_at', 'text', (col) => col.notNull())
        .addColumn('last_error', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute()
}

async function ensureForumAccessColumns(db: Kysely<Database>): Promise<void> {
    const table = (await db.introspection.getTables()).find((entry) => entry.name === 'forum_board_access')
    const existing = new Set(table?.columns.map((column) => column.name) ?? [])
    const columns: Array<[string, 'text' | 'integer']> = [
        ['payment_protocol', 'text'], ['revenue_router', 'text'],
        ['committee_registry', 'text'], ['entitlement_registry', 'text'],
        ['committee_size', 'integer'], ['committee_threshold', 'integer'],
    ]
    for (const [name, type] of columns) {
        if (!existing.has(name)) {
            await db.schema.alterTable('forum_board_access').addColumn(name, type).execute()
        }
    }
}
