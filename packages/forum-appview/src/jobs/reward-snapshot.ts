import cron from 'node-cron'
import { Kysely } from 'kysely'
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Database } from '../db/schema'
import { AtprotoSnapshotPublisher } from '../issuer/snapshot-publisher'
import { calculateRewards, type RewardExclusion, type RewardVote } from './reward-calculation'

const VAULT_ABI = parseAbi([
    'function available(bytes32 boardId) view returns (uint256)',
    'function rewardRoots(bytes32 boardId,uint64 rewardEpoch) view returns (bytes32 snapshotCommitment,bytes32 merkleRoot,uint256 totalAllocation,uint256 claimedAmount)',
])
const OPERATOR_ABI = parseAbi([
    'function delegations(address delegator) view returns (address operator,uint256 amount,uint256 pendingWithdrawal,uint64 withdrawAfter)',
])
const COMMITTEE_ABI = parseAbi(['function activeEpochId() view returns (uint64)'])
const TRIGGER_ABI = parseAbi(['function addTrigger(bytes data)'])

export class RewardSnapshotJob {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly publisher: AtprotoSnapshotPublisher,
        private readonly rpcUrl: string,
        private readonly operatorRegistry: Address,
        private readonly snapshotRepo: string,
        private readonly snapshotPds: string,
        private readonly trigger: Address,
        private readonly triggerPrivateKey: Hex,
    ) {}

    schedule() {
        cron.schedule('0 0 * * 1', () => {
            this.publishPreviousWeek().catch((error) => console.error('Reward snapshot failed:', error))
        }, { timezone: 'UTC' })
    }

    async publishPreviousWeek(now = new Date()): Promise<number> {
        const endMs = startOfUtcWeek(now).getTime()
        const startMs = endMs - 7 * 86_400_000
        const startsAt = new Date(startMs).toISOString()
        const endsAt = new Date(endMs).toISOString()
        const epochId = Math.floor(startMs / (7 * 86_400_000))
        const boards = await this.db.selectFrom('forum_board_access').selectAll().execute()
        let published = 0

        for (const access of boards) {
            const chain = defineChain({
                id: access.chain_id, name: `forum-${access.chain_id}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: { default: { http: [this.rpcUrl] } },
            })
            const client = createPublicClient({ chain, transport: http(this.rpcUrl) })
            const cutoffBlock = await client.getBlockNumber()
            const boardId = keccak256(stringToHex(access.board_uri))
            const pending = await this.db.selectFrom('forum_reward_snapshot').selectAll()
                .where('board_uri', '=', access.board_uri).where('status', '=', 'pending').execute()
            for (const snapshot of pending) {
                const root = await client.readContract({
                    address: access.pay_to as Address, abi: VAULT_ABI, functionName: 'rewardRoots',
                    args: [boardId, BigInt(snapshot.epoch_id)], blockNumber: cutoffBlock,
                })
                if (root[1] !== `0x${'00'.repeat(32)}`) {
                    await this.db.updateTable('forum_reward_snapshot').set({ status: 'published' })
                        .where('board_uri', '=', access.board_uri).where('epoch_id', '=', snapshot.epoch_id).execute()
                }
            }
            const unresolved = await this.db.selectFrom('forum_reward_snapshot').select('epoch_id')
                .where('board_uri', '=', access.board_uri).where('status', '=', 'pending').executeTakeFirst()
            if (unresolved) continue
            const existing = await this.db.selectFrom('forum_reward_snapshot').select('epoch_id')
                .where('board_uri', '=', access.board_uri).where('epoch_id', '=', epochId).executeTakeFirst()
            if (existing) continue
            const totalAmount = await client.readContract({
                address: access.pay_to as Address, abi: VAULT_ABI, functionName: 'available', args: [boardId], blockNumber: cutoffBlock,
            })
            if (totalAmount === 0n) continue

            const moderation = await this.moderationExclusions(access.board_uri, endsAt)
            const votes = (await this.boardVotes(access.board_uri, startsAt, endsAt))
                .filter((vote) =>
                    !moderation.excludedSubjects.has(vote.subjectUri) &&
                    !moderation.bannedDids.has(vote.authorDid) &&
                    !moderation.bannedDids.has(vote.voterDid),
                )
            const voterDids = [...new Set(votes.map((vote) => vote.voterDid))]
            const eligibleVoters = await this.eligibleVoters(client, voterDids, endsAt, cutoffBlock)
            const calculated = calculateRewards({
                boardId, epochId: BigInt(epochId), votes, eligibleVoters, totalAmount,
                exclusions: moderation.exclusions,
            })
            if (!calculated.allocations.length) continue

            const board = await this.db.selectFrom('forum_board_ref').selectAll()
                .where('board_uri', '=', access.board_uri).executeTakeFirst()
            if (!board) throw new Error(`Missing board CID for ${access.board_uri}`)
            const record = await this.publisher.publish({
                board: { uri: access.board_uri, cid: board.cid }, epochId, startsAt, endsAt, cutoffBlock,
                dataset: calculated.dataset, datasetHash: calculated.datasetHash,
                merkleRoot: calculated.merkleRoot, totalAllocated: totalAmount,
                allocationCount: calculated.allocations.length,
            })
            const committeeEpoch = await client.readContract({
                address: access.committee_registry as Address,
                abi: COMMITTEE_ABI,
                functionName: 'activeEpochId',
                blockNumber: cutoffBlock,
            })
            if (committeeEpoch === 0n) throw new Error(`No active reward committee for ${access.board_uri}`)
            const rkey = record.uri.split('/').at(-1)
            if (!rkey) throw new Error(`Invalid reward snapshot URI: ${record.uri}`)
            const triggerPayload = stringToHex(JSON.stringify({
                pds: this.snapshotPds,
                repo: this.snapshotRepo,
                rkey,
                recordCid: record.cid,
                boardId,
                committeeEpoch: Number(committeeEpoch),
            }))
            const wallet = createWalletClient({
                account: privateKeyToAccount(this.triggerPrivateKey), chain, transport: http(this.rpcUrl),
            })
            const triggerTx = await wallet.writeContract({
                address: this.trigger, abi: TRIGGER_ABI, functionName: 'addTrigger', args: [triggerPayload],
            })
            await client.waitForTransactionReceipt({ hash: triggerTx })
            await this.db.transaction().execute(async (trx) => {
                await trx.insertInto('forum_reward_snapshot').values({
                    board_uri: access.board_uri, epoch_id: epochId, starts_at: startsAt, ends_at: endsAt,
                    cutoff_block: cutoffBlock.toString(), record_uri: record.uri, record_cid: record.cid,
                    dataset_hash: calculated.datasetHash, merkle_root: calculated.merkleRoot,
                    total_allocated: totalAmount.toString(), allocation_count: calculated.allocations.length,
                    status: 'pending', created_at: new Date().toISOString(),
                }).execute()
                await trx.insertInto('forum_reward_allocation').values(calculated.allocations.map((row) => ({
                    board_uri: access.board_uri, epoch_id: epochId, did: row.did, did_hash: row.didHash,
                    amount: row.amount.toString(), weight: row.weight, leaf: row.leaf, proof: JSON.stringify(row.proof),
                }))).execute()
            })
            published += 1
        }
        return published
    }

    private async boardVotes(boardUri: string, startsAt: string, endsAt: string): Promise<RewardVote[]> {
        const topics = await this.db.selectFrom('forum_topic').select(['uri']).where('board_uri', '=', boardUri).execute()
        const topicUris = topics.map((row) => row.uri)
        if (!topicUris.length) return []
        const comments = await this.db.selectFrom('forum_comment').select(['uri']).where('topic_uri', 'in', topicUris).execute()
        const subjects = [...topicUris, ...comments.map((row) => row.uri)]
        const votes = await this.db.selectFrom('forum_vote').selectAll()
            .where('subject_uri', 'in', subjects)
            .where('created_at', '>=', startsAt).where('created_at', '<', endsAt).execute()
        return votes.map((row) => ({
            uri: row.uri, voterDid: row.voter_did, subjectUri: row.subject_uri,
            authorDid: row.author_did, direction: row.direction, createdAt: row.created_at,
        }))
    }

    private async moderationExclusions(
        boardUri: string,
        endsAt: string,
    ): Promise<{ excludedSubjects: Set<string>; bannedDids: Set<string>; exclusions: RewardExclusion[] }> {
        const excludedSubjects = new Set<string>()
        const bannedDids = new Set<string>()
        const exclusions: RewardExclusion[] = []

        const reviewRows = await this.db.selectFrom('forum_review_action').selectAll()
            .where('board_uri', '=', boardUri)
            .where('created_at', '<', endsAt)
            .orderBy('subject_uri')
            .orderBy('created_at', 'desc')
            .execute()
        const latestBySubject = new Map<string, typeof reviewRows[number]>()
        for (const row of reviewRows) {
            if (!latestBySubject.has(row.subject_uri)) latestBySubject.set(row.subject_uri, row)
        }
        for (const row of latestBySubject.values()) {
            if (row.action !== 'hide' && row.action !== 'reject') continue
            excludedSubjects.add(row.subject_uri)
            exclusions.push({
                type: 'exclusion',
                reason: row.action === 'hide' ? 'subject_hidden' : 'subject_rejected',
                boardUri,
                subjectUri: row.subject_uri,
                sourceUri: row.uri,
                sourceCid: row.cid,
                effectiveAt: row.created_at,
            })
        }

        const sanctions = await this.db.selectFrom('forum_sanction').selectAll()
            .where('board_uri', '=', boardUri)
            .where('kind', '=', 'ban')
            .where('created_at', '<', endsAt)
            .execute()
        for (const row of sanctions) {
            if (row.revoked_at && row.revoked_at < endsAt) continue
            if (row.expires_at && row.expires_at <= endsAt) continue
            bannedDids.add(row.subject_did)
            exclusions.push({
                type: 'exclusion',
                reason: 'author_banned',
                boardUri,
                did: row.subject_did,
                sourceUri: row.uri,
                sourceCid: row.cid,
                effectiveAt: row.created_at,
            })
            exclusions.push({
                type: 'exclusion',
                reason: 'voter_banned',
                boardUri,
                did: row.subject_did,
                sourceUri: row.uri,
                sourceCid: row.cid,
                effectiveAt: row.created_at,
            })
        }

        return { excludedSubjects, bannedDids, exclusions }
    }

    private async eligibleVoters(
        client: ReturnType<typeof createPublicClient>,
        dids: string[],
        endsAt: string,
        cutoffBlock: bigint,
    ): Promise<Map<string, string>> {
        const eligible = new Map<string, string>()
        for (const did of dids) {
            const links = await this.db.selectFrom('forum_wallet_link').select(['address'])
                .where('did', '=', did).where('issued_at', '<', endsAt).execute()
            for (const link of links) {
                const delegation = await client.readContract({
                    address: this.operatorRegistry, abi: OPERATOR_ABI, functionName: 'delegations',
                    args: [link.address as Address], blockNumber: cutoffBlock,
                })
                if (delegation[1] > 0n) { eligible.set(did, link.address); break }
            }
        }
        return eligible
    }
}

function startOfUtcWeek(value: Date): Date {
    const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
    const daysSinceMonday = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - daysSinceMonday)
    return date
}
