import express, { Request, Response } from 'express'
import { Kysely, sql } from 'kysely'
import type { Database } from '../db/schema'

export function createRouter(db: Kysely<Database>): express.Router {
    const router = express.Router()

    /**
     * GET /xrpc/app.creaton.feed.getTokenVotes
     *
     * Get token votes for a subject URI, with decay-weighted scores.
     */
    router.get('/xrpc/app.creaton.feed.getTokenVotes', async (req: Request, res: Response) => {
        try {
            const uri = req.query.uri as string
            const cid = req.query.cid as string | undefined
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
            const cursor = req.query.cursor as string | undefined

            if (!uri) {
                return res.status(400).json({ error: 'Missing required parameter: uri' })
            }

            // Get votes for this subject
            let query = db
                .selectFrom('token_vote')
                .leftJoin('token_vote_weight', (join) =>
                    join
                        .onRef('token_vote.uri', '=', 'token_vote_weight.vote_uri')
                        .on('token_vote_weight.snapshot_date', '=', sql`date('now')`),
                )
                .select([
                    'token_vote.uri',
                    'token_vote.voter_did',
                    'token_vote.token_contract',
                    'token_vote.claimed_amount',
                    'token_vote.direction',
                    'token_vote.created_at',
                    'token_vote.indexed_at',
                    'token_vote_weight.effective_weight',
                ])
                .where('token_vote.subject_uri', '=', uri)

            if (cid) {
                query = query.where('token_vote.subject_cid', '=', cid)
            }

            if (cursor) {
                query = query.where('token_vote.indexed_at', '<', cursor)
            }

            const votes = await query
                .orderBy('token_vote.indexed_at', 'desc')
                .limit(limit)
                .execute()

            // Calculate aggregate weights
            let upvoteWeight = 0n
            let downvoteWeight = 0n

            const formattedVotes = votes.map((v) => {
                const effectiveWeight = BigInt(v.effective_weight || v.claimed_amount)

                if (v.direction === 1) {
                    upvoteWeight += effectiveWeight
                } else {
                    downvoteWeight += effectiveWeight
                }

                return {
                    indexedAt: v.indexed_at,
                    createdAt: v.created_at,
                    actor: {
                        did: v.voter_did,
                        // Note: Full profile would be fetched from bsky appview
                    },
                    tokenContract: v.token_contract,
                    claimedAmount: v.claimed_amount,
                    effectiveWeight: effectiveWeight.toString(),
                    direction: v.direction,
                }
            })

            // Get total counts for the subject (regardless of pagination)
            const totals = await db
                .selectFrom('token_vote')
                .leftJoin('token_vote_weight', (join) =>
                    join
                        .onRef('token_vote.uri', '=', 'token_vote_weight.vote_uri')
                        .on('token_vote_weight.snapshot_date', '=', sql`date('now')`),
                )
                .select([
                    'token_vote.direction',
                    sql<string>`COALESCE(SUM(COALESCE(token_vote_weight.effective_weight, token_vote.claimed_amount)), '0')`.as(
                        'total_weight',
                    ),
                ])
                .where('token_vote.subject_uri', '=', uri)
                .groupBy('token_vote.direction')
                .execute()

            let totalUpvoteWeight = '0'
            let totalDownvoteWeight = '0'

            for (const t of totals) {
                if (t.direction === 1) {
                    totalUpvoteWeight = t.total_weight
                } else {
                    totalDownvoteWeight = t.total_weight
                }
            }

            const newCursor =
                votes.length === limit ? votes[votes.length - 1].indexed_at : undefined

            res.json({
                uri,
                cid,
                cursor: newCursor,
                upvoteWeight: totalUpvoteWeight,
                downvoteWeight: totalDownvoteWeight,
                votes: formattedVotes,
            })
        } catch (err) {
            console.error('Error in getTokenVotes:', err)
            res.status(500).json({ error: 'Internal server error' })
        }
    })

    /**
     * GET /health
     */
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok' })
    })

    return router
}
