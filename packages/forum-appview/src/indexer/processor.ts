import { Kysely } from 'kysely'
import type { Database } from '../db/schema'
import { embedText, serializeVector } from '../graph/embeddings'
import { parseDidFromAtUri } from '../graph/pagerank'

const FORUM_BOARD = 'app.creaton.forum.board'
const FORUM_TOPIC = 'app.creaton.forum.topic'
const FORUM_COMMENT = 'app.creaton.forum.comment'
const FORUM_VOTE = 'app.creaton.forum.vote'
const FORUM_MEMBER = 'app.creaton.forum.member'
const FORUM_KEY_CAPSULE = 'app.creaton.forum.keyCapsule'
const FORUM_REVIEW_ACTION = 'app.creaton.forum.reviewAction'
const FORUM_SANCTION = 'app.creaton.forum.sanction'
const ADDRESS_CONTROL = 'com.creaton.evm.addressControl'
const GRAPH_FOLLOW = 'app.bsky.graph.follow'
const CALENDAR_EVENT = 'community.lexicon.calendar.event'
const CALENDAR_RSVP = 'community.lexicon.calendar.rsvp'
const FORUM_BOARD_COLLECTION = 'app.creaton.forum.board'

type StrongRef = { uri: string; cid?: string }
type ProtectedBody = {
    version: number
    suite: string
    epoch: string
    salt: unknown
    nonce: unknown
    ciphertext: unknown
}

type BoardAccess = {
    kind: 'protected'
    issuerDid: string
    issuerEndpoint: string
    chainId: 2741 | 11124
    asset: string
    amount: string
    durationSeconds: number
    payTo: string
    paymentProtocol: 'mpp' | 'tempo'
    revenueRouter: string
    committeeRegistry: string
    entitlementRegistry: string
    committeeSize: 15
    committeeThreshold: 10
    historyPolicy: 'full' | 'window' | 'forward'
    epochSeconds: 86400
}

function readBoardAccess(value: unknown): BoardAccess | null {
    if (!value || typeof value !== 'object') return null
    const access = value as Record<string, unknown>
    if (
        access.kind !== 'protected' ||
        typeof access.issuerDid !== 'string' ||
        typeof access.issuerEndpoint !== 'string' ||
        (access.chainId !== 2741 && access.chainId !== 11124) ||
        typeof access.asset !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(access.asset) ||
        typeof access.amount !== 'string' ||
        !/^[1-9][0-9]*$/.test(access.amount) ||
        typeof access.durationSeconds !== 'number' ||
        !Number.isInteger(access.durationSeconds) ||
        access.durationSeconds < 60 ||
        typeof access.payTo !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(access.payTo) ||
        (access.paymentProtocol !== 'mpp' && access.paymentProtocol !== 'tempo') ||
        typeof access.revenueRouter !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(access.revenueRouter) ||
        typeof access.committeeRegistry !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(access.committeeRegistry) ||
        typeof access.entitlementRegistry !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(access.entitlementRegistry) ||
        access.committeeSize !== 15 || access.committeeThreshold !== 10 ||
        !['full', 'window', 'forward'].includes(String(access.historyPolicy)) ||
        access.epochSeconds !== 86400
    ) {
        return null
    }
    return access as BoardAccess
}

function readProtectedBody(value: unknown): ProtectedBody | null {
    if (!value || typeof value !== 'object') return null
    const body = value as Record<string, unknown>
    if (
        (body.version !== 1 && body.version !== 2 && body.version !== 3) ||
        body.suite !== 'HKDF-SHA256/AES-256-GCM' ||
        typeof body.epoch !== 'string' ||
        !body.salt ||
        !body.nonce ||
        !body.ciphertext ||
        (body.version === 2 && (
            typeof body.committeeEpoch !== 'number' || !Number.isInteger(body.committeeEpoch) ||
            body.committeeEpoch < 1 || typeof body.keyEpochUri !== 'string'
        )) ||
        (body.version === 3 && (
            typeof body.committeeEpoch !== 'number' || !Number.isInteger(body.committeeEpoch) ||
            body.committeeEpoch < 1 || typeof body.keyCapsuleUri !== 'string'
        ))
    ) {
        return null
    }
    return body as ProtectedBody
}

function readBytes(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const bytes = (value as { $bytes?: unknown }).$bytes
    return typeof bytes === 'string' && /^[A-Za-z0-9_-]+$/.test(bytes) ? bytes : null
}

export class ForumProcessor {
    constructor(private readonly db: Kysely<Database>) {}

    async processRecord(
        uri: string,
        did: string,
        collection: string,
        record: Record<string, unknown>,
        cid?: string,
    ) {
        const indexedAt = new Date().toISOString()
        switch (collection) {
            case FORUM_BOARD:
                await this.indexBoard(uri, record, indexedAt, cid)
                break
            case FORUM_TOPIC:
                await this.indexTopic(uri, did, record, indexedAt)
                break
            case FORUM_COMMENT:
                await this.indexComment(uri, did, record, indexedAt)
                break
            case FORUM_VOTE:
                await this.indexVote(uri, did, record, indexedAt)
                break
            case FORUM_MEMBER:
                await this.indexMember(uri, did, record, indexedAt)
                break
            case FORUM_KEY_CAPSULE:
                await this.indexKeyCapsule(uri, record, indexedAt)
                break
            case FORUM_REVIEW_ACTION:
                await this.indexReviewAction(uri, did, record, indexedAt, cid)
                break
            case FORUM_SANCTION:
                await this.indexSanction(uri, did, record, indexedAt, cid)
                break
            case ADDRESS_CONTROL:
                await this.indexWalletLink(uri, did, record, indexedAt, cid)
                break
            case GRAPH_FOLLOW:
                await this.indexFollow(did, record, indexedAt)
                break
            case CALENDAR_EVENT:
                await this.indexEvent(uri, did, record, indexedAt)
                break
            case CALENDAR_RSVP:
                await this.indexEventRsvp(uri, did, record, indexedAt)
                break
            default:
                break
        }
    }

    async deleteRecord(uri: string, collection: string, did?: string, record?: Record<string, unknown>) {
        switch (collection) {
            case FORUM_BOARD:
                await this.db.deleteFrom('forum_board').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_board_access').where('board_uri', '=', uri).execute()
                await this.db.deleteFrom('forum_board_ref').where('board_uri', '=', uri).execute()
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_TOPIC:
                await this.db.deleteFrom('forum_topic').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_protected_record').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_COMMENT:
                await this.db.deleteFrom('forum_comment').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_protected_record').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_VOTE:
                await this.db.deleteFrom('forum_vote').where('uri', '=', uri).execute()
                break
            case FORUM_MEMBER:
                await this.db.deleteFrom('forum_member').where('uri', '=', uri).execute()
                break
            case FORUM_KEY_CAPSULE:
                await this.db.deleteFrom('forum_key_capsule').where('uri', '=', uri).execute()
                break
            case FORUM_REVIEW_ACTION:
                await this.db.deleteFrom('forum_review_action').where('uri', '=', uri).execute()
                break
            case FORUM_SANCTION:
                await this.db.deleteFrom('forum_sanction').where('uri', '=', uri).execute()
                break
            case ADDRESS_CONTROL:
                await this.db.deleteFrom('forum_wallet_link').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_wallet_attestation').where('uri', '=', uri).execute()
                break
            case GRAPH_FOLLOW:
                if (did && typeof record?.subject === 'string') {
                    await this.db
                        .deleteFrom('forum_follow')
                        .where('follower_did', '=', did)
                        .where('subject_did', '=', record.subject)
                        .execute()
                }
                break
            case CALENDAR_EVENT:
                await this.db.deleteFrom('forum_event').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_event_rsvp').where('event_uri', '=', uri).execute()
                break
            case CALENDAR_RSVP:
                await this.db.deleteFrom('forum_event_rsvp').where('uri', '=', uri).execute()
                break
            default:
                break
        }
    }

    private async indexBoard(
        uri: string,
        record: Record<string, unknown>,
        indexedAt: string,
        cid?: string,
    ) {
        const title = String(record.title ?? '')
        const description = record.description ? String(record.description) : null
        await this.db
            .insertInto('forum_board')
            .values({ uri, title, description, indexed_at: indexedAt })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    title,
                    description,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
        if (cid) {
            await this.db
                .insertInto('forum_board_ref')
                .values({ board_uri: uri, cid, indexed_at: indexedAt })
                .onConflict((oc) => oc.column('board_uri').doUpdateSet({ cid, indexed_at: indexedAt }))
                .execute()
        }
        const access = readBoardAccess(record.access)
        if (access) {
            await this.db
                .insertInto('forum_board_access')
                .values({
                    board_uri: uri,
                    issuer_did: access.issuerDid,
                    issuer_endpoint: access.issuerEndpoint,
                    chain_id: access.chainId,
                    asset: access.asset.toLowerCase(),
                    amount: access.amount,
                    duration_seconds: access.durationSeconds,
                    pay_to: access.payTo.toLowerCase(),
                    payment_protocol: access.paymentProtocol,
                    revenue_router: access.revenueRouter.toLowerCase(),
                    committee_registry: access.committeeRegistry.toLowerCase(),
                    entitlement_registry: access.entitlementRegistry.toLowerCase(),
                    committee_size: access.committeeSize,
                    committee_threshold: access.committeeThreshold,
                    history_policy: access.historyPolicy,
                    epoch_seconds: access.epochSeconds,
                    indexed_at: indexedAt,
                })
                .onConflict((oc) =>
                    oc.column('board_uri').doUpdateSet({
                        issuer_did: access.issuerDid,
                        issuer_endpoint: access.issuerEndpoint,
                        chain_id: access.chainId,
                        asset: access.asset.toLowerCase(),
                        amount: access.amount,
                        duration_seconds: access.durationSeconds,
                        pay_to: access.payTo.toLowerCase(),
                        payment_protocol: access.paymentProtocol,
                        revenue_router: access.revenueRouter.toLowerCase(),
                        committee_registry: access.committeeRegistry.toLowerCase(),
                        entitlement_registry: access.entitlementRegistry.toLowerCase(),
                        committee_size: access.committeeSize,
                        committee_threshold: access.committeeThreshold,
                        history_policy: access.historyPolicy,
                        epoch_seconds: access.epochSeconds,
                        indexed_at: indexedAt,
                    }),
                )
                .execute()
        } else {
            await this.db.deleteFrom('forum_board_access').where('board_uri', '=', uri).execute()
        }
        await this.upsertEmbedding(uri, 'board', `${title} ${description ?? ''}`, indexedAt)
    }

    private async indexTopic(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const board = record.board as StrongRef | undefined
        const title = String(record.title ?? '')
        const body = record.body ? String(record.body) : null
        const protectedBody = readProtectedBody(record.protectedBody)
        const createdAt = String(record.createdAt ?? indexedAt)
        if (!board?.uri) return
        await this.db
            .insertInto('forum_topic')
            .values({
                uri,
                board_uri: board.uri,
                author_did: did,
                title,
                body,
                created_at: createdAt,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    board_uri: board.uri,
                    author_did: did,
                    title,
                    body,
                    created_at: createdAt,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
        if (protectedBody) {
            await this.upsertProtectedRecord({
                uri,
                boardUri: board.uri,
                topicUri: null,
                did,
                kind: 'topic',
                protectedBody,
                indexedAt,
            })
            await this.upsertEmbedding(uri, 'topic', title, indexedAt)
        } else {
            await this.db.deleteFrom('forum_protected_record').where('uri', '=', uri).execute()
            await this.upsertEmbedding(uri, 'topic', `${title} ${body ?? ''}`, indexedAt)
        }
    }

    private async indexComment(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const topic = record.topic as StrongRef | undefined
        const body = String(record.body ?? '')
        const protectedBody = readProtectedBody(record.protectedBody)
        const createdAt = String(record.createdAt ?? indexedAt)
        if (!topic?.uri) return
        await this.db
            .insertInto('forum_comment')
            .values({
                uri,
                topic_uri: topic.uri,
                author_did: did,
                body,
                created_at: createdAt,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    topic_uri: topic.uri,
                    author_did: did,
                    body,
                    created_at: createdAt,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
        if (protectedBody) {
            const parentTopic = await this.db
                .selectFrom('forum_topic')
                .select('board_uri')
                .where('uri', '=', topic.uri)
                .executeTakeFirst()
            if (parentTopic) {
                await this.upsertProtectedRecord({
                    uri,
                    boardUri: parentTopic.board_uri,
                    topicUri: topic.uri,
                    did,
                    kind: 'comment',
                    protectedBody,
                    indexedAt,
                })
            }
            await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
        } else {
            await this.db.deleteFrom('forum_protected_record').where('uri', '=', uri).execute()
            await this.upsertEmbedding(uri, 'comment', body, indexedAt)
        }
    }

    private async upsertProtectedRecord(input: {
        uri: string
        boardUri: string
        topicUri: string | null
        did: string
        kind: 'topic' | 'comment'
        protectedBody: ProtectedBody
        indexedAt: string
    }) {
        await this.db
            .insertInto('forum_protected_record')
            .values({
                uri: input.uri,
                board_uri: input.boardUri,
                topic_uri: input.topicUri,
                author_did: input.did,
                kind: input.kind,
                encrypted_body: JSON.stringify(input.protectedBody),
                epoch: input.protectedBody.epoch,
                indexed_at: input.indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    board_uri: input.boardUri,
                    topic_uri: input.topicUri,
                    author_did: input.did,
                    kind: input.kind,
                    encrypted_body: JSON.stringify(input.protectedBody),
                    epoch: input.protectedBody.epoch,
                    indexed_at: input.indexedAt,
                }),
            )
            .execute()
    }

    private async indexKeyCapsule(
        uri: string,
        record: Record<string, unknown>,
        indexedAt: string,
    ) {
        const board = record.board as StrongRef | undefined
        const encapsulation = readBytes(record.encapsulation)
        const policyHash = readBytes(record.policyHash)
        const committeeEpoch = Number(record.committeeEpoch)
        const createdAt = String(record.createdAt ?? '')
        if (
            !board?.uri || typeof record.recordUri !== 'string' ||
            record.version !== 1 ||
            record.suite !== 'BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM' ||
            !Number.isSafeInteger(committeeEpoch) || committeeEpoch < 1 ||
            !encapsulation || !policyHash || !createdAt
        ) return
        await this.db.insertInto('forum_key_capsule').values({
            uri,
            board_uri: board.uri,
            record_uri: record.recordUri,
            committee_epoch: committeeEpoch,
            policy_hash: policyHash,
            encapsulation,
            created_at: createdAt,
            indexed_at: indexedAt,
        }).onConflict((oc) => oc.column('uri').doUpdateSet({
            board_uri: board.uri,
            record_uri: record.recordUri as string,
            committee_epoch: committeeEpoch,
            policy_hash: policyHash,
            encapsulation,
            created_at: createdAt,
            indexed_at: indexedAt,
        })).execute()
    }

    private async indexVote(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const subject = record.subject as StrongRef | undefined
        const direction = record.direction === 'down' ? 'down' : 'up'
        const createdAt = String(record.createdAt ?? indexedAt)
        if (!subject?.uri) return

        const subjectKind = await this.resolveSubjectKind(subject.uri)
        const authorDid = parseDidFromAtUri(subject.uri)
        if (!authorDid) return

        await this.db
            .insertInto('forum_vote')
            .values({
                uri,
                voter_did: did,
                subject_uri: subject.uri,
                author_did: authorDid,
                subject_kind: subjectKind,
                direction,
                created_at: createdAt,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    voter_did: did,
                    subject_uri: subject.uri,
                    author_did: authorDid,
                    subject_kind: subjectKind,
                    direction,
                    created_at: createdAt,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }

    private async indexWalletLink(
        uri: string,
        did: string,
        record: Record<string, unknown>,
        indexedAt: string,
        cid?: string,
    ) {
        const siwe = record.siwe as Record<string, unknown> | undefined
        const address = typeof siwe?.address === 'string' ? siwe.address.toLowerCase() : ''
        const chainId = Number(siwe?.chainId)
        const issuedAt = typeof siwe?.issuedAt === 'string' ? siwe.issuedAt : ''
        if (!/^0x[0-9a-f]{40}$/.test(address) || !Number.isSafeInteger(chainId) || !issuedAt) return
        await this.db.insertInto('forum_wallet_link').values({
            uri, did, address, chain_id: chainId, cid: cid ?? null, issued_at: issuedAt, indexed_at: indexedAt,
        }).onConflict((oc) => oc.column('uri').doUpdateSet({
            did, address, chain_id: chainId, cid: cid ?? null, issued_at: issuedAt, indexed_at: indexedAt,
        })).execute()
        const latest = await this.db.selectFrom('forum_wallet_attestation')
            .select('version').where('did', '=', did).orderBy('version', 'desc').executeTakeFirst()
        const version = (latest?.version ?? 0) + 1
        await this.db.insertInto('forum_wallet_attestation').values({
            uri,
            did,
            address,
            cid: cid ?? null,
            version,
            status: 'pending',
            trigger_tx: null,
            created_at: indexedAt,
            updated_at: indexedAt,
        }).onConflict((oc) => oc.column('uri').doUpdateSet({
            did,
            address,
            cid: cid ?? null,
            status: 'pending',
            updated_at: indexedAt,
        })).execute()
    }

    private async indexReviewAction(
        uri: string,
        did: string,
        record: Record<string, unknown>,
        indexedAt: string,
        cid?: string,
    ) {
        const board = record.board as StrongRef | undefined
        const subject = record.subject as StrongRef | undefined
        const action = typeof record.action === 'string' ? record.action : ''
        const createdAt = String(record.createdAt ?? indexedAt)
        if (
            !board?.uri || !subject?.uri ||
            !['approve', 'reject', 'hide', 'restore'].includes(action) ||
            !createdAt
        ) return
        const reason = typeof record.reason === 'string' ? record.reason : null
        await this.db.insertInto('forum_review_action').values({
            uri,
            cid: cid ?? null,
            board_uri: board.uri,
            subject_uri: subject.uri,
            action: action as 'approve' | 'reject' | 'hide' | 'restore',
            moderator_did: did,
            reason,
            created_at: createdAt,
            indexed_at: indexedAt,
        }).onConflict((oc) => oc.column('uri').doUpdateSet({
            cid: cid ?? null,
            board_uri: board.uri,
            subject_uri: subject.uri,
            action: action as 'approve' | 'reject' | 'hide' | 'restore',
            moderator_did: did,
            reason,
            created_at: createdAt,
            indexed_at: indexedAt,
        })).execute()
    }

    private async indexSanction(
        uri: string,
        did: string,
        record: Record<string, unknown>,
        indexedAt: string,
        cid?: string,
    ) {
        const board = record.board as StrongRef | undefined
        const subject = typeof record.subject === 'string' ? record.subject : ''
        const kind = typeof record.kind === 'string' ? record.kind : ''
        const createdAt = String(record.createdAt ?? indexedAt)
        if (
            !board?.uri || !subject.startsWith('did:') ||
            !['mute', 'ban', 'postApproval'].includes(kind) ||
            !createdAt
        ) return
        await this.db.insertInto('forum_sanction').values({
            uri,
            cid: cid ?? null,
            board_uri: board.uri,
            subject_did: subject,
            kind: kind as 'mute' | 'ban' | 'postApproval',
            moderator_did: did,
            reason: typeof record.reason === 'string' ? record.reason : null,
            expires_at: typeof record.expiresAt === 'string' ? record.expiresAt : null,
            revoked_at: typeof record.revokedAt === 'string' ? record.revokedAt : null,
            created_at: createdAt,
            indexed_at: indexedAt,
        }).onConflict((oc) => oc.column('uri').doUpdateSet({
            cid: cid ?? null,
            board_uri: board.uri,
            subject_did: subject,
            kind: kind as 'mute' | 'ban' | 'postApproval',
            moderator_did: did,
            reason: typeof record.reason === 'string' ? record.reason : null,
            expires_at: typeof record.expiresAt === 'string' ? record.expiresAt : null,
            revoked_at: typeof record.revokedAt === 'string' ? record.revokedAt : null,
            created_at: createdAt,
            indexed_at: indexedAt,
        })).execute()
    }

    private async indexMember(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const board = record.board as StrongRef | undefined
        const createdAt = String(record.createdAt ?? indexedAt)
        if (!board?.uri) return
        await this.db
            .insertInto('forum_member')
            .values({
                uri,
                user_did: did,
                board_uri: board.uri,
                created_at: createdAt,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    user_did: did,
                    board_uri: board.uri,
                    created_at: createdAt,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }

    private async indexFollow(did: string, record: Record<string, unknown>, indexedAt: string) {
        const subject = typeof record.subject === 'string' ? record.subject : null
        if (!subject) return
        await this.db
            .insertInto('forum_follow')
            .values({
                follower_did: did,
                subject_did: subject,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.columns(['follower_did', 'subject_did']).doUpdateSet({
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }

    private async indexEvent(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const name = String(record.name ?? '')
        const startsAt = record.startsAt ? String(record.startsAt) : null
        if (!startsAt) return
        const endsAt = record.endsAt ? String(record.endsAt) : null
        const status = record.status ? String(record.status) : null
        const mode = record.mode ? String(record.mode) : null
        const boardUri = extractBoardUriFromEvent(record)
        await this.db
            .insertInto('forum_event')
            .values({
                uri,
                author_did: did,
                board_uri: boardUri,
                name,
                starts_at: startsAt,
                ends_at: endsAt,
                status,
                mode,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    author_did: did,
                    board_uri: boardUri,
                    name,
                    starts_at: startsAt,
                    ends_at: endsAt,
                    status,
                    mode,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }

    private async indexEventRsvp(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const subject = record.subject as StrongRef | undefined
        const statusRaw = record.status ? String(record.status) : 'community.lexicon.calendar.rsvp#going'
        const status = normalizeRsvpStatus(statusRaw)
        if (!subject?.uri) return
        await this.db
            .insertInto('forum_event_rsvp')
            .values({
                uri,
                event_uri: subject.uri,
                user_did: did,
                status,
                indexed_at: indexedAt,
            })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    event_uri: subject.uri,
                    user_did: did,
                    status,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }

    private async resolveSubjectKind(subjectUri: string): Promise<'topic' | 'comment'> {
        const topic = await this.db
            .selectFrom('forum_topic')
            .select('uri')
            .where('uri', '=', subjectUri)
            .executeTakeFirst()
        if (topic) return 'topic'
        const comment = await this.db
            .selectFrom('forum_comment')
            .select('uri')
            .where('uri', '=', subjectUri)
            .executeTakeFirst()
        if (comment) return 'comment'
        return subjectUri.includes('/app.creaton.forum.topic/') ? 'topic' : 'comment'
    }

    private async upsertEmbedding(
        uri: string,
        kind: 'topic' | 'comment' | 'board',
        text: string,
        indexedAt: string,
    ) {
        const vector = serializeVector(embedText(text))
        await this.db
            .insertInto('forum_embedding')
            .values({ uri, kind, vector, indexed_at: indexedAt })
            .onConflict((oc) =>
                oc.column('uri').doUpdateSet({
                    kind,
                    vector,
                    indexed_at: indexedAt,
                }),
            )
            .execute()
    }
}

function extractBoardUriFromEvent(record: Record<string, unknown>): string | null {
    const uris = record.uris
    if (!Array.isArray(uris)) return null
    for (const entry of uris) {
        if (!entry || typeof entry !== 'object') continue
        const uri = (entry as { uri?: unknown }).uri
        if (typeof uri !== 'string') continue
        if (uri.includes(`/${FORUM_BOARD_COLLECTION}/`)) return uri
    }
    return null
}

function normalizeRsvpStatus(status: string): string {
    if (status.includes('#')) {
        const short = status.split('#').pop()
        if (short === 'going' || short === 'interested' || short === 'notgoing') return short
    }
    if (status === 'going' || status === 'interested' || status === 'notgoing') return status
    return 'going'
}
