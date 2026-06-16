import cron from 'node-cron'
import { Kysely } from 'kysely'
import type { Database } from '../db/schema'
import { computePageRank } from '../graph/pagerank'
import { config } from '../config'

export class PageRankRefreshJob {
    constructor(private readonly db: Kysely<Database>) {}

    schedule() {
        cron.schedule('15 * * * *', () => {
            this.run().catch((err) => console.error('PageRank refresh failed:', err))
        })
        this.run().catch((err) => console.error('Initial PageRank refresh failed:', err))
    }

    async run() {
        const edges = await this.db.selectFrom('forum_follow').selectAll().execute()
        const ranks = computePageRank(
            edges.map((edge) => ({ follower: edge.follower_did, subject: edge.subject_did })),
            config.PAGERANK_DAMPING,
            config.PAGERANK_ITERATIONS,
        )

        const now = new Date().toISOString()
        for (const [did, score] of ranks.entries()) {
            await this.db
                .insertInto('forum_pagerank')
                .values({ did, score, updated_at: now })
                .onConflict((oc) => oc.column('did').doUpdateSet({ score, updated_at: now }))
                .execute()
        }

        await this.recomputeKarma(ranks, now)
        console.log(`PageRank refresh complete (${ranks.size} nodes)`)
    }

    private async recomputeKarma(ranks: Map<string, number>, updatedAt: string) {
        const votes = await this.db.selectFrom('forum_vote').selectAll().execute()
        const karma = new Map<string, { post: number; comment: number }>()

        for (const vote of votes) {
            const weight = ranks.get(vote.voter_did) ?? 1
            const sign = vote.direction === 'up' ? 1 : -1
            const delta = sign * weight
            const current = karma.get(vote.author_did) ?? { post: 0, comment: 0 }
            if (vote.subject_kind === 'topic') current.post += delta
            else current.comment += delta
            karma.set(vote.author_did, current)
        }

        for (const [did, value] of karma.entries()) {
            const total = value.post + value.comment
            await this.db
                .insertInto('forum_karma')
                .values({
                    did,
                    post_karma: value.post,
                    comment_karma: value.comment,
                    total_karma: total,
                    updated_at: updatedAt,
                })
                .onConflict((oc) =>
                    oc.column('did').doUpdateSet({
                        post_karma: value.post,
                        comment_karma: value.comment,
                        total_karma: total,
                        updated_at: updatedAt,
                    }),
                )
                .execute()
        }
    }
}
