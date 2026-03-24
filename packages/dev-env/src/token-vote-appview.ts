import getPort from 'get-port'
import express, { Express, Request, Response } from 'express'
import { Server } from 'http'
import WebSocket from 'ws'

export interface TokenVoteAppviewConfig {
    port?: number
    tapUrl: string
    tapAdminPassword?: string
    rpcUrl?: string
    dbPath?: string
    feedGenUrl?: string
}

interface TokenVote {
    uri: string
    cid: string
    voter_did: string
    wallet_address: string
    subject_uri: string
    subject_cid: string
    token_contract: string
    claimed_amount: string
    chain_id: number
    direction: number
    signature: Uint8Array | string
    created_at: string
    indexed_at: string
}

/**
 * Test helper for running a Token Vote AppView instance in dev-env.
 *
 * This is a simplified in-memory implementation for testing.
 * For production, use the full packages/token-vote-appview service.
 */
export class TestTokenVoteAppview {
    private app: Express
    private server?: Server
    private tapWs?: WebSocket
    private votes: Map<string, TokenVote> = new Map() // uri -> vote
    private votesBySubject: Map<string, Set<string>> = new Map() // subject_uri -> set of vote uris
    private boostAmounts: Map<string, bigint> = new Map() // subject_uri -> total boost in USDC wei
    private feedGenUrl?: string
    private rpcUrl: string

    constructor(
        public url: string,
        public port: number,
        public tapUrl: string,
        feedGenUrl?: string,
        rpcUrl?: string,
    ) {
        this.feedGenUrl = feedGenUrl
        this.rpcUrl = rpcUrl || 'http://127.0.0.1:8545'
        this.app = express()
        this.app.use(express.json())

        // CORS for browser access - MUST be before routes
        this.app.use((_req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*')
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            res.header('Access-Control-Allow-Headers', 'Content-Type')
            if (_req.method === 'OPTIONS') {
                return res.sendStatus(200)
            }
            next()
        })

        this.setupRoutes()
    }

    static async create(cfg: TokenVoteAppviewConfig): Promise<TestTokenVoteAppview> {
        const port = cfg.port ?? (await getPort())
        const url = `http://localhost:${port}`

        const appview = new TestTokenVoteAppview(
            url,
            port,
            cfg.tapUrl,
            cfg.feedGenUrl,
            cfg.rpcUrl,
        )
        await appview.start()
        return appview
    }

    /**
     * Check on-chain ERC20 token balance for a wallet address at the 'latest' block.
     * No caching - always fetch fresh balance for accuracy.
     */
    private async getTokenBalance(tokenContract: string, walletAddress: string): Promise<bigint> {
        const contractLower = tokenContract.toLowerCase()
        const walletLower = walletAddress.toLowerCase()

        try {
            // Encode balanceOf call data
            const paddedAddress = walletLower.replace('0x', '').padStart(64, '0')
            const callData = '0x70a08231' + paddedAddress // balanceOf(address)

            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [
                        {
                            to: contractLower,
                            data: callData,
                        },
                        'latest',
                    ],
                    id: 1,
                }),
            })

            const result = await response.json()
            let balance = BigInt(0)

            if (!result.error && result.result && typeof result.result === 'string' && result.result.startsWith('0x')) {
                try {
                    balance = BigInt(result.result)
                } catch (parseErr) {
                    console.error(`[TokenVoteAppview] Failed to parse balance result: ${result.result}`, parseErr)
                }
            } else if (result.error) {
                console.error(`[TokenVoteAppview] RPC error:`, result.error)
            }

            console.log(`[TokenVoteAppview] Balance for ${walletLower} on ${contractLower}: ${balance}`)
            return balance
        } catch (err) {
            console.error('[TokenVoteAppview] Failed to fetch balance:', err)
            return BigInt(0)
        }
    }

    /**
     * Revalidate all votes for a specific post/token combination.
     * Removes votes where the wallet no longer holds enough tokens.
     * Called before processing a new vote to prevent double-spending.
     */
    private async revalidateVotesForPost(subjectUri: string, tokenContract: string): Promise<void> {
        const voteUris = this.votesBySubject.get(subjectUri)
        if (!voteUris) return

        const contractLower = tokenContract.toLowerCase()
        const votesToRemove: string[] = []

        for (const voteUri of voteUris) {
            const vote = this.votes.get(voteUri)
            if (!vote || vote.token_contract !== contractLower) continue

            // Skip registration votes (amount=1) - they don't need balance
            if (vote.claimed_amount === '1' && vote.direction === 1) continue

            const currentBalance = await this.getTokenBalance(vote.token_contract, vote.wallet_address)
            const claimedAmount = BigInt(vote.claimed_amount)

            if (currentBalance < claimedAmount) {
                console.log(`[TokenVoteAppview] Removing vote ${voteUri}: wallet ${vote.wallet_address} balance ${currentBalance} < claimed ${claimedAmount}`)
                votesToRemove.push(voteUri)
            }
        }

        // Remove invalid votes
        for (const voteUri of votesToRemove) {
            const vote = this.votes.get(voteUri)
            if (vote) {
                this.votes.delete(voteUri)
                this.votesBySubject.get(vote.subject_uri)?.delete(voteUri)
            }
        }

        if (votesToRemove.length > 0) {
            console.log(`[TokenVoteAppview] Removed ${votesToRemove.length} invalid votes for ${subjectUri}`)
            // Update feed gen with new weights
            if (this.feedGenUrl) {
                await this.pushWeightsToFeedGen(subjectUri, tokenContract)
            }
        }
    }

    private setupRoutes() {
        // Health check
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok' })
        })

        // XRPC: getTokenVotes
        this.app.get('/xrpc/app.creaton.feed.getTokenVotes', (req: Request, res: Response) => {
            const uri = req.query.uri as string
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)

            if (!uri) {
                return res.status(400).json({ error: 'InvalidRequest', message: 'Missing uri parameter' })
            }

            const voteUris = this.votesBySubject.get(uri) ?? new Set()
            const votes: TokenVote[] = []

            for (const voteUri of voteUris) {
                const vote = this.votes.get(voteUri)
                if (vote) {
                    votes.push(vote)
                }
                if (votes.length >= limit) break
            }

            // Calculate weights (simplified - no decay in test implementation)
            let upvoteWeight = BigInt(0)
            let downvoteWeight = BigInt(0)

            const formattedVotes = votes.map((v) => {
                const weight = BigInt(v.claimed_amount)
                if (v.direction === 1) {
                    upvoteWeight += weight
                } else {
                    downvoteWeight += weight
                }

                return {
                    indexedAt: v.indexed_at,
                    createdAt: v.created_at,
                    actor: { did: v.voter_did },
                    tokenContract: v.token_contract,
                    claimedAmount: v.claimed_amount,
                    effectiveWeight: v.claimed_amount, // No decay in test
                    direction: v.direction,
                }
            })

            res.json({
                uri,
                upvoteWeight: upvoteWeight.toString(),
                downvoteWeight: downvoteWeight.toString(),
                votes: formattedVotes,
            })
        })

        // Direct vote submission endpoint for dev-env (bypasses TAP)
        this.app.post('/admin/submit-vote', async (req: Request, res: Response) => {
            const { uri, cid, voterDid, record } = req.body

            if (!uri || !voterDid || !record) {
                return res.status(400).json({ error: 'Missing required fields: uri, voterDid, record' })
            }

            console.log(`[TokenVoteAppview] Direct vote submission: ${uri}`)
            const result = await this.processVote(uri, cid || '', voterDid, record)

            if (result.success) {
                res.json({ success: true })
            } else {
                res.status(400).json({ error: result.error })
            }
        })

        // Update BOOST amount for a subject (called by dev-env harness when simulating boosts)
        this.app.post('/admin/update-boost', (req: Request, res: Response) => {
            const { subjectUri, boostAmount } = req.body as {
                subjectUri: string
                boostAmount: string
            }

            if (!subjectUri || boostAmount === undefined) {
                return res.status(400).json({ error: 'Missing subjectUri or boostAmount' })
            }

            this.boostAmounts.set(subjectUri, BigInt(boostAmount))
            console.log(`[TokenVoteAppview] Updated boost for ${subjectUri}: ${boostAmount}`)

            // Push updated weights to feed gen with new boost amount
            if (this.feedGenUrl) {
                this.pushWeightsToFeedGen(subjectUri).catch(err => {
                    console.error('Failed to push weights to feed gen after boost update:', err)
                })
            }

            res.json({ success: true })
        })
    }

    private async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`[TokenVoteAppview] Started on port ${this.port}`)
                // Subscribe to TAP WebSocket to receive vote records
                this.subscribeToTap()
                resolve()
            })
        })
    }

    /**
     * Subscribe to TAP WebSocket channel to receive vote record events.
     */
    private subscribeToTap(): void {
        const wsUrl = this.tapUrl.replace('http://', 'ws://') + '/channel'
        console.log(`[TokenVoteAppview] Connecting to TAP at ${wsUrl}`)

        this.tapWs = new WebSocket(wsUrl)

        this.tapWs.on('open', () => {
            console.log('[TokenVoteAppview] Connected to TAP')
        })

        this.tapWs.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString())
                if (event.type === 'record' && event.record?.collection === 'app.creaton.feed.tokenVote') {
                    this.handleVoteRecordEvent(event)
                }
            } catch (err) {
                console.error('[TokenVoteAppview] Error parsing TAP message:', err)
            }
        })

        this.tapWs.on('error', (err) => {
            console.error('[TokenVoteAppview] TAP WebSocket error:', err)
        })

        this.tapWs.on('close', () => {
            console.log('[TokenVoteAppview] TAP connection closed, reconnecting in 5s...')
            setTimeout(() => this.subscribeToTap(), 5000)
        })
    }

    /**
     * Handle a vote record event from TAP.
     */
    private async handleVoteRecordEvent(event: {
        id: number
        record: {
            did: string
            collection: string
            rkey: string
            action: string
            cid?: string
            record?: unknown
        }
    }): Promise<void> {
        const { did, rkey, action, cid, record } = event.record

        if (action !== 'create' || !record) {
            return
        }

        const uri = `at://${did}/app.creaton.feed.tokenVote/${rkey}`
        const voteRecord = record as {
            subject: { uri: string; cid: string }
            walletAddress: string
            tokenContract: string
            tokenAmount: string
            chainId: number
            direction: number
            signature: Uint8Array | string
            createdAt: string
        }

        console.log(`[TokenVoteAppview] Processing vote from TAP: ${uri}`)

        const result = await this.processVote(uri, cid || '', did, voteRecord)
        if (result.success) {
            // Acknowledge the event
            this.tapWs?.send(JSON.stringify({ type: 'ack', id: event.id }))
        }
    }

    /**
     * Process a token vote record event (called by TAP consumer or directly).
     * Signatures are required except for self-registration votes (direction=1, amount=1, voting on own post).
     * Before accepting a vote, revalidates all existing votes for the same post to prevent double-spending.
     */
    async processVote(
        uri: string,
        cid: string,
        voterDid: string,
        record: {
            subject: { uri: string; cid: string }
            walletAddress: string
            tokenContract: string
            tokenAmount: string
            chainId: number
            direction: number
            signature: Uint8Array | string // bytes or string for backwards compatibility
            createdAt: string
        },
    ): Promise<{ success: boolean; error?: string }> {
        const hasEmptySignature =
            (record.signature instanceof Uint8Array && record.signature.length === 0) ||
            (typeof record.signature === 'string' && record.signature.length === 0)

        // Self-registration votes (direction=1, amount=1, voting on own post) don't need signatures
        const subjectAuthorDid = record.subject.uri.split('/')[2] // at://did:plc:xxx/...
        const isSelfVote = voterDid === subjectAuthorDid
        const isRegistrationVote = record.direction === 1 && record.tokenAmount === '1'

        if (hasEmptySignature && !(isSelfVote && isRegistrationVote)) {
            return { success: false, error: 'Missing signature' }
        }

        const walletLower = record.walletAddress.toLowerCase()
        const contractLower = record.tokenContract.toLowerCase()

        // Skip balance check for registration votes (amount=1)
        if (!isRegistrationVote) {
            // First, revalidate all existing votes for this post - this removes any where tokens moved
            await this.revalidateVotesForPost(record.subject.uri, record.tokenContract)

            // Check if this wallet already has a vote on this post (after revalidation)
            for (const existingVote of this.votes.values()) {
                if (existingVote.wallet_address === walletLower &&
                    existingVote.subject_uri === record.subject.uri &&
                    existingVote.token_contract === contractLower) {
                    return {
                        success: false,
                        error: 'This wallet has already voted on this post'
                    }
                }
            }

            // Verify on-chain balance at latest block
            const onChainBalance = await this.getTokenBalance(record.tokenContract, record.walletAddress)
            const claimedAmount = BigInt(record.tokenAmount)

            if (onChainBalance < claimedAmount) {
                console.log(`[TokenVoteAppview] Insufficient balance: ${onChainBalance} < ${claimedAmount}`)
                return {
                    success: false,
                    error: `Insufficient token balance. You have ${onChainBalance.toString()} but tried to vote with ${claimedAmount.toString()}`
                }
            }

            console.log(`[TokenVoteAppview] Balance verified: ${onChainBalance} >= ${claimedAmount}`)
        }

        // Check for duplicate (same voter DID + subject)
        for (const existingVote of this.votes.values()) {
            if (existingVote.voter_did === voterDid && existingVote.subject_uri === record.subject.uri) {
                return { success: false, error: 'Duplicate vote for this post' }
            }
        }

        const now = new Date().toISOString()

        const vote: TokenVote = {
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
            signature: record.signature,
            created_at: record.createdAt,
            indexed_at: now,
        }

        this.votes.set(uri, vote)

        // Index by subject
        if (!this.votesBySubject.has(record.subject.uri)) {
            this.votesBySubject.set(record.subject.uri, new Set())
        }
        this.votesBySubject.get(record.subject.uri)!.add(uri)

        // Push updated weights to feed generator
        if (this.feedGenUrl) {
            this.pushWeightsToFeedGen(record.subject.uri, record.tokenContract).catch(err => {
                console.error('Failed to push weights to feed gen:', err)
            })
        }

        return { success: true }
    }

    /**
     * Calculate and push aggregate weights to Feed Generator.
     * Includes the current boost amount for this subject so the feed gen
     * can compute the combined score.
     */
    private async pushWeightsToFeedGen(subjectUri: string, tokenContract?: string): Promise<void> {
        if (!this.feedGenUrl) return

        let upvoteWeight = BigInt(0)
        let downvoteWeight = BigInt(0)

        for (const vote of this.votes.values()) {
            if (vote.subject_uri === subjectUri) {
                if (tokenContract && vote.token_contract !== tokenContract.toLowerCase()) continue
                const weight = BigInt(vote.claimed_amount)
                if (vote.direction === 1) {
                    upvoteWeight += weight
                } else {
                    downvoteWeight += weight
                }
            }
        }

        const boostAmount = this.boostAmounts.get(subjectUri) ?? BigInt(0)

        // We need to pass a tokenAddress for the feed-gen's map key.
        // Use a well-known sentinel for the combined (community) feed.
        const tokenAddress = tokenContract ?? 'combined'

        try {
            await fetch(`${this.feedGenUrl}/admin/update-weights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokenAddress,
                    subjectUri,
                    upvoteWeight: upvoteWeight.toString(),
                    downvoteWeight: downvoteWeight.toString(),
                    boostAmount: boostAmount.toString(),
                }),
            })
        } catch (err) {
            console.error('Failed to update feed gen weights:', err)
        }
    }

    /**
     * Delete a vote record.
     */
    deleteVote(uri: string): void {
        const vote = this.votes.get(uri)
        if (vote) {
            this.votes.delete(uri)
            this.votesBySubject.get(vote.subject_uri)?.delete(uri)
        }
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err) reject(err)
                    else resolve()
                })
            } else {
                resolve()
            }
        })
    }
}
