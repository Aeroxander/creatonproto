import express, { Request, Response } from 'express'
import { Kysely } from 'kysely'
import type { Database } from '../db/schema'
import {
    cosineSimilarity,
    deserializeVector,
    embedText,
} from '../graph/embeddings'

export function createRouter(db: Kysely<Database>): express.Router {
    const router = express.Router()

    router.get('/xrpc/app.creaton.forum.getPosterRewards', async (req: Request, res: Response) => {
        const did = String(req.query.did ?? '')
        if (!did) return res.status(400).json({ error: 'Missing required parameter: did' })
        const rows = await db.selectFrom('forum_reward_allocation as a')
            .innerJoin('forum_reward_snapshot as s', (join) => join
                .onRef('s.board_uri', '=', 'a.board_uri').onRef('s.epoch_id', '=', 'a.epoch_id'))
            .select([
                'a.board_uri as boardUri', 'a.epoch_id as epochId', 'a.amount as amount',
                'a.weight as weight', 's.merkle_root as merkleRoot', 's.status as status',
                's.record_uri as snapshotUri',
            ]).where('a.did', '=', did).orderBy('a.epoch_id', 'desc').execute()
        return res.json({ did, rewards: rows })
    })

    router.get('/xrpc/app.creaton.forum.getRewardClaim', async (req: Request, res: Response) => {
        const boardUri = String(req.query.boardUri ?? '')
        const did = String(req.query.did ?? '')
        const epochId = Number(req.query.epochId)
        if (!boardUri || !did || !Number.isSafeInteger(epochId)) {
            return res.status(400).json({ error: 'boardUri, did, and epochId are required' })
        }
        const row = await db.selectFrom('forum_reward_allocation').selectAll()
            .where('board_uri', '=', boardUri).where('epoch_id', '=', epochId).where('did', '=', did)
            .executeTakeFirst()
        if (!row) return res.status(404).json({ error: 'Reward allocation not found' })
        return res.json({
            boardUri, epochId, did, didHash: row.did_hash, amount: row.amount,
            leaf: row.leaf, proof: JSON.parse(row.proof),
        })
    })

    router.get('/xrpc/app.creaton.forum.getDidWalletBinding', async (req: Request, res: Response) => {
        const did = String(req.query.did ?? '')
        if (!did) return res.status(400).json({ error: 'Missing required parameter: did' })
        const link = await db.selectFrom('forum_wallet_link').selectAll()
            .where('did', '=', did).orderBy('issued_at', 'desc').executeTakeFirst()
        if (!link) return res.json({ did, status: 'unlinked' })
        const attestation = await db.selectFrom('forum_wallet_attestation').selectAll()
            .where('uri', '=', link.uri).executeTakeFirst()
        return res.json({
            did,
            status: attestation?.status ?? 'pending',
            wallet: link.address,
            chainId: link.chain_id,
            linkUri: link.uri,
            linkCid: link.cid,
            version: attestation?.version ?? null,
            updatedAt: attestation?.updated_at ?? link.indexed_at,
        })
    })

    router.get('/xrpc/app.creaton.forum.getVoteSummary', async (req: Request, res: Response) => {
        try {
            const subjectUri = req.query.subjectUri as string
            if (!subjectUri) {
                return res.status(400).json({ error: 'Missing required parameter: subjectUri' })
            }
            const votes = await db
                .selectFrom('forum_vote')
                .select(['direction'])
                .where('subject_uri', '=', subjectUri)
                .execute()
            let up = 0
            let down = 0
            for (const vote of votes) {
                if (vote.direction === 'up') up += 1
                else down += 1
            }
            return res.json({ subjectUri, up, down, score: up - down })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    router.get('/xrpc/app.creaton.forum.getUserKarma', async (req: Request, res: Response) => {
        try {
            const did = req.query.did as string
            if (!did) return res.status(400).json({ error: 'Missing required parameter: did' })
            const karma = await db
                .selectFrom('forum_karma')
                .selectAll()
                .where('did', '=', did)
                .executeTakeFirst()
            return res.json({
                did,
                postKarma: karma?.post_karma ?? 0,
                commentKarma: karma?.comment_karma ?? 0,
                totalKarma: karma?.total_karma ?? 0,
            })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    router.get('/xrpc/app.creaton.forum.getNetworkBoards', async (req: Request, res: Response) => {
        try {
            const viewerDid = req.query.viewerDid as string
            const limit = Math.min(parseInt(req.query.limit as string) || 5, 20)
            if (!viewerDid) {
                return res.status(400).json({ error: 'Missing required parameter: viewerDid' })
            }

            const follows = await db
                .selectFrom('forum_follow')
                .select('subject_did')
                .where('follower_did', '=', viewerDid)
                .execute()
            const followSet = new Set(follows.map((row) => row.subject_did))
            if (followSet.size === 0) return res.json({ boards: [] })

            const members = await db.selectFrom('forum_member').selectAll().execute()
            const topics = await db
                .selectFrom('forum_topic')
                .select(['board_uri', 'author_did'])
                .execute()

            const activity = new Map<string, number>()
            for (const member of members) {
                if (!followSet.has(member.user_did)) continue
                activity.set(member.board_uri, (activity.get(member.board_uri) ?? 0) + 2)
            }
            for (const topic of topics) {
                if (!followSet.has(topic.author_did)) continue
                activity.set(topic.board_uri, (activity.get(topic.board_uri) ?? 0) + 1)
            }

            const ranked = [...activity.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)

            const boards = []
            for (const [boardUri, networkActivity] of ranked) {
                const board = await db
                    .selectFrom('forum_board')
                    .selectAll()
                    .where('uri', '=', boardUri)
                    .executeTakeFirst()
                if (!board) continue
                boards.push({
                    boardUri,
                    title: board.title,
                    description: board.description ?? undefined,
                    networkActivity,
                })
            }
            return res.json({ boards })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    router.get('/xrpc/app.creaton.forum.searchForum', async (req: Request, res: Response) => {
        try {
            const query = (req.query.query as string)?.trim()
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
            if (!query) return res.status(400).json({ error: 'Missing required parameter: query' })

            const queryVector = embedText(query)
            const embeddings = await db.selectFrom('forum_embedding').selectAll().execute()
            const hits: {
                uri: string
                kind: 'topic' | 'comment'
                title?: string
                body: string
                boardUri?: string
                topicUri?: string
                authorDid: string
                createdAt: string
                score: number
            }[] = []

            for (const row of embeddings) {
                if (row.kind === 'board') continue
                const similarity = cosineSimilarity(queryVector, deserializeVector(row.vector))
                if (similarity <= 0.05) continue

                if (row.kind === 'topic') {
                    const topic = await db
                        .selectFrom('forum_topic')
                        .selectAll()
                        .where('uri', '=', row.uri)
                        .executeTakeFirst()
                    if (!topic) continue
                    hits.push({
                        uri: topic.uri,
                        kind: 'topic',
                        title: topic.title,
                        body: topic.body ?? '',
                        boardUri: topic.board_uri,
                        authorDid: topic.author_did,
                        createdAt: topic.created_at,
                        score: similarity,
                    })
                } else {
                    const comment = await db
                        .selectFrom('forum_comment')
                        .selectAll()
                        .where('uri', '=', row.uri)
                        .executeTakeFirst()
                    if (!comment) continue
                    const topic = await db
                        .selectFrom('forum_topic')
                        .select(['board_uri'])
                        .where('uri', '=', comment.topic_uri)
                        .executeTakeFirst()
                    hits.push({
                        uri: comment.uri,
                        kind: 'comment',
                        body: comment.body,
                        boardUri: topic?.board_uri,
                        topicUri: comment.topic_uri,
                        authorDid: comment.author_did,
                        createdAt: comment.created_at,
                        score: similarity,
                    })
                }
            }

            hits.sort((a, b) => b.score - a.score)
            return res.json({ results: hits.slice(0, limit) })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    router.get('/xrpc/app.creaton.forum.getRelatedTopics', async (req: Request, res: Response) => {
        try {
            const topicUri = req.query.topicUri as string
            const limit = Math.min(parseInt(req.query.limit as string) || 5, 20)
            if (!topicUri) {
                return res.status(400).json({ error: 'Missing required parameter: topicUri' })
            }

            const source = await db
                .selectFrom('forum_embedding')
                .selectAll()
                .where('uri', '=', topicUri)
                .executeTakeFirst()
            if (!source) return res.json({ topics: [] })

            const sourceVector = deserializeVector(source.vector)
            const topicEmbeddings = await db
                .selectFrom('forum_embedding')
                .selectAll()
                .where('kind', '=', 'topic')
                .execute()

            const related: {
                uri: string
                title: string
                boardUri: string
                similarity: number
            }[] = []

            for (const row of topicEmbeddings) {
                if (row.uri === topicUri) continue
                const similarity = cosineSimilarity(sourceVector, deserializeVector(row.vector))
                if (similarity <= 0.1) continue
                const topic = await db
                    .selectFrom('forum_topic')
                    .selectAll()
                    .where('uri', '=', row.uri)
                    .executeTakeFirst()
                if (!topic) continue
                related.push({
                    uri: topic.uri,
                    title: topic.title,
                    boardUri: topic.board_uri,
                    similarity,
                })
            }

            related.sort((a, b) => b.similarity - a.similarity)
            return res.json({ topics: related.slice(0, limit) })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    router.get('/xrpc/app.creaton.forum.getUpcomingEvents', async (req: Request, res: Response) => {
        try {
            const viewerDid = req.query.viewerDid as string | undefined
            const boardUri = req.query.boardUri as string | undefined
            const boardUrisParam = req.query.boardUris
            const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
            const now = new Date().toISOString()
            const cancelledStatus = 'community.lexicon.calendar.event#cancelled'

            let query = db
                .selectFrom('forum_event')
                .selectAll()
                .where('starts_at', '>=', now)
                .where((eb) =>
                    eb.or([
                        eb('status', 'is', null),
                        eb('status', '!=', cancelledStatus),
                    ]),
                )

            if (boardUri) {
                query = query.where('board_uri', '=', boardUri)
            } else if (boardUrisParam) {
                const boardUris = Array.isArray(boardUrisParam)
                    ? (boardUrisParam as string[])
                    : String(boardUrisParam)
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean)
                if (boardUris.length > 0) {
                    query = query.where('board_uri', 'in', boardUris)
                } else {
                    query = query.where('board_uri', 'is not', null)
                }
            } else {
                query = query.where('board_uri', 'is not', null)
            }

            const rows = await query.orderBy('starts_at', 'asc').limit(limit).execute()

            const events = []
            for (const row of rows) {
                const rsvps = await db
                    .selectFrom('forum_event_rsvp')
                    .selectAll()
                    .where('event_uri', '=', row.uri)
                    .execute()

                let goingCount = 0
                let interestedCount = 0
                let viewerRsvp: string | undefined
                for (const rsvp of rsvps) {
                    if (rsvp.status === 'going') goingCount += 1
                    else if (rsvp.status === 'interested') interestedCount += 1
                    if (viewerDid && rsvp.user_did === viewerDid) {
                        viewerRsvp = rsvp.status
                    }
                }

                let boardTitle: string | undefined
                if (row.board_uri) {
                    const board = await db
                        .selectFrom('forum_board')
                        .select('title')
                        .where('uri', '=', row.board_uri)
                        .executeTakeFirst()
                    boardTitle = board?.title
                }

                events.push({
                    uri: row.uri,
                    name: row.name,
                    startsAt: row.starts_at,
                    endsAt: row.ends_at ?? undefined,
                    boardUri: row.board_uri ?? undefined,
                    boardTitle,
                    authorDid: row.author_did,
                    mode: row.mode ?? undefined,
                    status: row.status ?? undefined,
                    goingCount,
                    interestedCount,
                    viewerRsvp,
                })
            }

            return res.json({ events })
        } catch (err) {
            console.error(err)
            return res.status(500).json({ error: 'Internal error' })
        }
    })

    return router
}
