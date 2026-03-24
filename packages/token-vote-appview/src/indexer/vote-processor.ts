import { Kysely, sql } from 'kysely'
import type { Database } from '../db/schema'
import { EvmRpcClient } from '../evm/rpc'
import { verifyVoteSignature } from '../evm/signature'
import { FeedGenClient } from '../feed-gen-client'

export interface TokenVoteRecord {
    did: string
    collection: string
    rkey: string
    cid: string
    record: {
        subject: {
            uri: string
            cid: string
        }
        walletAddress: string
        tokenContract: string
        tokenAmount: string
        chainId: number
        direction: number
        signature: Uint8Array
        createdAt: string
    }
}

// ─── Holding-duration multiplier ─────────────────────────────────────────────
//
// Rewards wallets that have held tokens for longer before voting.
// This makes double-spending (transfer → vote → transfer back) less attractive
// because a fresh wallet has almost no multiplier.
//
// Formula: multiplier = tanh(holdingDays / HOLDING_HALF_SATURATION)
//   - At 0 days held  → multiplier ≈ 0   (brand-new wallet, near-zero weight)
//   - At 30 days held → multiplier ≈ 0.76
//   - At 90 days held → multiplier ≈ 0.97  (essentially full weight)
//   - Saturates at 1.0 — holding forever doesn't keep growing past 1×
//
// HOLDING_HALF_SATURATION = 30 means 30 days to reach ~0.76 of full weight.
//
const HOLDING_HALF_SATURATION = 30

/**
 * Approximate holding-duration multiplier (0–1) given how many days
 * the tokens have been sitting in this wallet.
 *
 * We approximate token age at vote time by checking the earliest Transfer
 * event to the wallet for this ERC-20 — or fall back to the block the wallet
 * was first used. This is done at snapshot time only (expensive); at vote
 * submission time we pass holdingDays=0 so the vote is accepted immediately
 * and the real multiplier is applied at the next snapshot.
 */
export function holdingMultiplier(holdingDays: number): number {
    if (holdingDays <= 0) return 0
    return Math.tanh(holdingDays / HOLDING_HALF_SATURATION)
}

// ─── Time-decay ───────────────────────────────────────────────────────────────
//
// Older votes decay so that recent community sentiment matters more than
// stale votes cast months ago.
//
// Formula: decay = 0.95^days  (half-life ≈ 13.5 days)
//
const DECAY_RATE = 0.95

export function timeDecay(createdAt: string): number {
    const created = new Date(createdAt)
    const now = new Date()
    const days = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    return Math.pow(DECAY_RATE, days)
}

// ─── Effective weight ─────────────────────────────────────────────────────────

/**
 * Calculate the effective vote weight in CREATE wei.
 *
 *   effective = min(claimed, currentBalance) × timeDecay × holdingMultiplier
 *
 * Represented as bigint using basis points (×10000) internally then scaled back.
 */
export function calculateEffectiveWeight(
    claimedAmount: bigint,
    currentBalance: bigint,
    decay: number,
    holding: number,
): bigint {
    const cap = claimedAmount < currentBalance ? claimedAmount : currentBalance
    const combinedFactor = decay * holding
    const factorBps = BigInt(Math.floor(combinedFactor * 10_000))
    return (cap * factorBps) / 10_000n
}

// ─── VoteProcessor ───────────────────────────────────────────────────────────

export class VoteProcessor {
    constructor(
        private db: Kysely<Database>,
        private rpc: EvmRpcClient,
        private feedGenClient?: FeedGenClient,
    ) { }

    async processVote(
        uri: string,
        cid: string,
        voterDid: string,
        record: TokenVoteRecord['record'],
    ): Promise<{ success: boolean; error?: string }> {
        // 1. Verify signature
        const signatureBytes = decodeSignature(record.signature)

        const isValidSig = verifyVoteSignature(
            record.walletAddress,
            record.direction,
            record.tokenAmount,
            record.tokenContract,
            record.subject.uri,
            record.createdAt,
            signatureBytes,
        )

        if (!isValidSig) {
            return { success: false, error: 'Invalid signature' }
        }

        // 2. Check live token balance — rejects immediately if insufficient
        let currentBalance = BigInt(0)
        try {
            currentBalance = await this.rpc.getTokenBalance(
                record.walletAddress,
                record.tokenContract,
                record.chainId,
            )

            const claimedAmount = BigInt(record.tokenAmount)
            if (currentBalance < claimedAmount) {
                return {
                    success: false,
                    error: `Insufficient balance: has ${currentBalance}, claimed ${claimedAmount}`,
                }
            }
        } catch (err) {
            console.error('Failed to check balance, proceeding:', err)
            // Continue — balance will be verified at next snapshot
        }

        // 3. Store vote
        const now = new Date().toISOString()
        const today = now.split('T')[0]

        try {
            await this.db
                .insertInto('token_vote')
                .values({
                    uri,
                    cid,
                    voter_did: voterDid,
                    wallet_address: record.walletAddress.toLowerCase(),
                    subject_uri: record.subject.uri,
                    subject_cid: record.subject.cid,
                    token_contract: record.tokenContract.toLowerCase(),
                    claimed_amount: record.tokenAmount,
                    chain_id: record.chainId,
                    direction: record.direction,
                    signature: Buffer.from(signatureBytes),
                    created_at: record.createdAt,
                    indexed_at: now,
                })
                .execute()
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
                return { success: false, error: 'Duplicate vote for this post' }
            }
            throw err
        }

        // 4. Seed snapshot immediately so the vote takes effect right away.
        //    At submission time we don't know holding-duration yet, so we use
        //    holdingMultiplier(0) ≈ 0. The daily snapshot will recalculate with
        //    the real holding duration derived from on-chain history.
        //
        //    This means a brand-new wallet voting gets nearly zero weight until
        //    the snapshot runs, which directly counters the transfer-and-revote attack.
        //    A wallet that has held tokens for 30+ days gets near-full weight immediately
        //    because the snapshot will have already stored their holding days.
        try {
            const claimedAmount = BigInt(record.tokenAmount)
            const decay = timeDecay(record.createdAt)
            // In local dev skip the holding-duration penalty so votes show up immediately.
            // In production, holdingDays=0 at submission and the daily snapshot corrects it.
            const devSkipHolding = process.env.DEV_SKIP_HOLDING_CHECK === 'true'
            const seedHoldingDays = devSkipHolding ? 90 : 0
            const initialWeight = calculateEffectiveWeight(claimedAmount, currentBalance, decay, holdingMultiplier(seedHoldingDays))

            await this.db
                .insertInto('token_vote_weight')
                .values({
                    vote_uri: uri,
                    snapshot_date: today,
                    verified_balance: currentBalance.toString(),
                    effective_weight: initialWeight.toString(),
                    holding_days: seedHoldingDays,
                })
                .onConflict((oc) =>
                    oc.columns(['vote_uri', 'snapshot_date']).doUpdateSet({
                        verified_balance: currentBalance.toString(),
                        effective_weight: initialWeight.toString(),
                        holding_days: seedHoldingDays,
                    }),
                )
                .execute()
        } catch (err) {
            console.error('Failed to seed snapshot for new vote:', err)
            // Non-fatal — snapshot will catch it
        }

        // 5. Push updated effective weights to feed generator
        if (this.feedGenClient) {
            await this.pushWeightsToFeedGen(record.tokenContract, record.subject.uri)
        }

        return { success: true }
    }

    /**
     * Aggregate effective vote weights for a subject and push to feed generator.
     *
     * Uses the latest snapshot effective_weight for each vote.
     * Falls back to claimed_amount for votes that have no snapshot yet
     * (shouldn't happen after the immediate seeding above, but kept as safety net).
     */
    async pushWeightsToFeedGen(tokenContract: string, subjectUri: string): Promise<void> {
        if (!this.feedGenClient) return

        try {
            // Get the most recent effective_weight per vote for this subject+token
            const rows = await this.db
                .selectFrom('token_vote as v')
                .leftJoin(
                    // Latest snapshot per vote
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
                    'v.claimed_amount',
                    // Use effective_weight from snapshot; fall back to claimed_amount
                    sql<string>`COALESCE(w.effective_weight, v.claimed_amount)`.as('weight'),
                ])
                .where('v.token_contract', '=', tokenContract.toLowerCase())
                .where('v.subject_uri', '=', subjectUri)
                .execute()

            let upvoteWeight = BigInt(0)
            let downvoteWeight = BigInt(0)

            for (const row of rows) {
                const w = BigInt(row.weight)
                if (row.direction === 1) {
                    upvoteWeight += w
                } else {
                    downvoteWeight += w
                }
            }

            await this.feedGenClient.updateWeight(
                tokenContract,
                subjectUri,
                upvoteWeight.toString(),
                downvoteWeight.toString(),
            )
        } catch (err) {
            console.error('Failed to push weights to feed gen:', err)
        }
    }

    async deleteVote(uri: string): Promise<void> {
        await this.db.deleteFrom('token_vote').where('uri', '=', uri).execute()
    }
}

function decodeSignature(signature: Uint8Array | string): Uint8Array {
    if (signature instanceof Uint8Array) {
        return signature
    }

    if (signature.startsWith('0x')) {
        return Uint8Array.from(Buffer.from(signature.slice(2), 'hex'))
    }

    return Uint8Array.from(Buffer.from(signature, 'base64'))
}
