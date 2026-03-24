import * as cron from 'node-cron'
import { Kysely, sql } from 'kysely'
import type { Database } from '../db/schema'
import { EvmRpcClient } from '../evm/rpc'
import { FeedGenClient } from '../feed-gen-client'
import { timeDecay, holdingMultiplier, calculateEffectiveWeight } from '../indexer/vote-processor'

export class DailySnapshotJob {
    constructor(
        private db: Kysely<Database>,
        private rpc: EvmRpcClient,
        private feedGenClient?: FeedGenClient,
    ) { }

    async runSnapshot(): Promise<void> {
        const today = new Date().toISOString().split('T')[0]
        console.log(`[Snapshot] Running daily snapshot for ${today}...`)

        const votes = await this.db
            .selectFrom('token_vote')
            .selectAll()
            .execute()

        console.log(`[Snapshot] Processing ${votes.length} votes...`)

        // Track which (tokenContract, subjectUri) pairs need feed-gen updates
        const affectedPairs = new Set<string>()

        for (const vote of votes) {
            try {
                const currentBalance = await this.rpc.getTokenBalance(
                    vote.wallet_address,
                    vote.token_contract,
                    vote.chain_id,
                )

                // How long have these tokens been sitting in this wallet?
                const holdingDays = await this.getHoldingDays(
                    vote.wallet_address,
                    vote.token_contract,
                    vote.chain_id,
                    vote.created_at,
                )

                const decay = timeDecay(vote.created_at)
                const holding = holdingMultiplier(holdingDays)
                const claimedAmount = BigInt(vote.claimed_amount)
                const effectiveWeight = calculateEffectiveWeight(claimedAmount, currentBalance, decay, holding)

                await this.db
                    .insertInto('token_vote_weight')
                    .values({
                        vote_uri: vote.uri,
                        snapshot_date: today,
                        verified_balance: currentBalance.toString(),
                        effective_weight: effectiveWeight.toString(),
                        holding_days: holdingDays,
                    })
                    .onConflict((oc) =>
                        oc.columns(['vote_uri', 'snapshot_date']).doUpdateSet({
                            verified_balance: currentBalance.toString(),
                            effective_weight: effectiveWeight.toString(),
                            holding_days: holdingDays,
                        }),
                    )
                    .execute()

                affectedPairs.add(`${vote.token_contract}::${vote.subject_uri}`)

                console.log(
                    `[Snapshot] ${vote.uri}: ` +
                    `balance=${currentBalance} held=${holdingDays}d ` +
                    `decay=${decay.toFixed(3)} holding=${holding.toFixed(3)} ` +
                    `effective=${effectiveWeight}`,
                )
            } catch (err) {
                console.error(`[Snapshot] Failed to process vote ${vote.uri}:`, err)
            }
        }

        console.log(`[Snapshot] Complete. Pushing weights for ${affectedPairs.size} post(s)...`)

        // Push fresh effective weights to the feed-gen for every affected post
        if (this.feedGenClient) {
            for (const pair of affectedPairs) {
                const [tokenContract, subjectUri] = pair.split('::')
                await this.pushSubjectWeights(tokenContract, subjectUri)
            }
        }

        console.log('[Snapshot] Done.')
    }

    /**
     * Aggregate effective weights for a subject and push to feed-gen.
     * Uses the latest snapshot_date per vote.
     */
    private async pushSubjectWeights(tokenContract: string, subjectUri: string): Promise<void> {
        if (!this.feedGenClient) return

        try {
            const rows = await this.db
                .selectFrom('token_vote as v')
                .leftJoin(
                    this.db
                        .selectFrom('token_vote_weight')
                        .select(['vote_uri', sql<string>`MAX(snapshot_date)`.as('latest_date')])
                        .groupBy('vote_uri')
                        .as('lw'),
                    'lw.vote_uri', 'v.uri',
                )
                .leftJoin('token_vote_weight as w', (join) =>
                    join.onRef('w.vote_uri', '=', 'v.uri').onRef('w.snapshot_date', '=', 'lw.latest_date'),
                )
                .select([
                    'v.direction',
                    sql<string>`COALESCE(w.effective_weight, v.claimed_amount)`.as('weight'),
                ])
                .where('v.token_contract', '=', tokenContract.toLowerCase())
                .where('v.subject_uri', '=', subjectUri)
                .execute()

            let upvoteWeight = BigInt(0)
            let downvoteWeight = BigInt(0)

            for (const row of rows) {
                const w = BigInt(row.weight)
                if (row.direction === 1) upvoteWeight += w
                else downvoteWeight += w
            }

            await this.feedGenClient.updateWeight(
                tokenContract,
                subjectUri,
                upvoteWeight.toString(),
                downvoteWeight.toString(),
            )
        } catch (err) {
            console.error(`[Snapshot] Failed to push weights for ${subjectUri}:`, err)
        }
    }

    /**
     * Estimate how many days the wallet has held the token by finding the
     * earliest Transfer event *to* this wallet for the given ERC-20.
     *
     * Uses eth_getLogs with the ERC-20 Transfer topic filtered to `to = wallet`.
     * We binary-search from block 0 to the block at vote creation time.
     *
     * Falls back to 0 if the RPC call fails or no transfer is found.
     */
    private async getHoldingDays(
        walletAddress: string,
        tokenContract: string,
        chainId: number,
        votedAt: string,
    ): Promise<number> {
        try {
            // ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
            const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            const paddedWallet = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0')

            const logs = await this.rpc.getLogs(
                tokenContract,
                transferTopic,
                paddedWallet,  // topic2 = Transfer to this wallet
                chainId,
            )

            if (!logs || logs.length === 0) return 0

            // Earliest block where tokens arrived
            const earliest = logs.reduce((min: number, log: { blockNumber: number }) =>
                log.blockNumber < min ? log.blockNumber : min,
                logs[0].blockNumber,
            )

            const blockMs = await this.rpc.getBlockTimestamp(earliest, chainId)
            if (!blockMs) return 0

            const voteTime = new Date(votedAt).getTime()
            const holdingMs = voteTime - blockMs
            return Math.max(0, holdingMs / (1000 * 60 * 60 * 24))
        } catch (err) {
            console.warn('[Snapshot] Could not determine holding days, defaulting to 0:', err)
            return 0
        }
    }

    schedule(): void {
        cron.schedule('0 0 * * *', () => {
            this.runSnapshot().catch(console.error)
        })
        console.log('[Snapshot] Daily snapshot job scheduled (midnight UTC)')
    }
}
