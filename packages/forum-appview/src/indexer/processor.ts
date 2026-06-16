import { Kysely } from 'kysely'
import type { Database } from '../db/schema'
import { embedText, serializeVector } from '../graph/embeddings'
import { parseDidFromAtUri } from '../graph/pagerank'

const FORUM_BOARD = 'app.creaton.forum.board'
const FORUM_TOPIC = 'app.creaton.forum.topic'
const FORUM_COMMENT = 'app.creaton.forum.comment'
const FORUM_VOTE = 'app.creaton.forum.vote'
const FORUM_MEMBER = 'app.creaton.forum.member'
const GRAPH_FOLLOW = 'app.bsky.graph.follow'
const CALENDAR_EVENT = 'community.lexicon.calendar.event'
const CALENDAR_RSVP = 'community.lexicon.calendar.rsvp'
const FORUM_BOARD_COLLECTION = 'app.creaton.forum.board'

type StrongRef = { uri: string; cid?: string }

export class ForumProcessor {
    constructor(private readonly db: Kysely<Database>) {}

    async processRecord(
        uri: string,
        did: string,
        collection: string,
        record: Record<string, unknown>,
    ) {
        const indexedAt = new Date().toISOString()
        switch (collection) {
            case FORUM_BOARD:
                await this.indexBoard(uri, record, indexedAt)
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
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_TOPIC:
                await this.db.deleteFrom('forum_topic').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_COMMENT:
                await this.db.deleteFrom('forum_comment').where('uri', '=', uri).execute()
                await this.db.deleteFrom('forum_embedding').where('uri', '=', uri).execute()
                break
            case FORUM_VOTE:
                await this.db.deleteFrom('forum_vote').where('uri', '=', uri).execute()
                break
            case FORUM_MEMBER:
                await this.db.deleteFrom('forum_member').where('uri', '=', uri).execute()
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

    private async indexBoard(uri: string, record: Record<string, unknown>, indexedAt: string) {
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
        await this.upsertEmbedding(uri, 'board', `${title} ${description ?? ''}`, indexedAt)
    }

    private async indexTopic(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const board = record.board as StrongRef | undefined
        const title = String(record.title ?? '')
        const body = record.body ? String(record.body) : null
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
        await this.upsertEmbedding(uri, 'topic', `${title} ${body ?? ''}`, indexedAt)
    }

    private async indexComment(uri: string, did: string, record: Record<string, unknown>, indexedAt: string) {
        const topic = record.topic as StrongRef | undefined
        const body = String(record.body ?? '')
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
        await this.upsertEmbedding(uri, 'comment', body, indexedAt)
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
