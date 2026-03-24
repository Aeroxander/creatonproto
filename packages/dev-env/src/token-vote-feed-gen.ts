import events from 'node:events'
import http from 'node:http'
import * as plc from '@did-plc/lib'
import express from 'express'
import getPort from 'get-port'
import { Secp256k1Keypair } from '@creatonproto/crypto'
import { createLexiconServer } from '@creatonproto/pds'
import { InvalidRequestError } from '@creatonproto/xrpc-server'

export interface TokenVoteFeedGenConfig {
  plcUrl: string
  tokenVoteAppviewUrl: string
  port?: number
  did?: string // Optional: use this DID instead of creating a new one
}

interface VoteWeight {
  subjectUri: string
  upvoteWeight: bigint   // raw CREATE token wei (18 decimals)
  downvoteWeight: bigint // raw CREATE token wei (18 decimals)
  boostAmount: bigint    // USDC wei (6 decimals)
  combinedScore: bigint  // comparable score in USDC micro (6 decimals)
}

/**
 * Compute the combined feed ranking score.
 *
 * Formula (all values in their native units):
 *   netCreateTokens = upvoteWeight - downvoteWeight  (raw, 18-decimal wei)
 *   netCreateUSDC   = netCreateTokens * CREATE_PRICE_MICRO / 1e18
 *   combinedScore   = boostAmount + netCreateUSDC
 *
 * CREATE_PRICE_MICRO = 100_000 means 1 CREATE = $0.10 in USDC 6-decimal terms
 *   (1 USDC = 1_000_000 micro; $0.10 = 100_000 micro)
 *
 * Scores are clamped to 0 (no negative rankings).
 */
export const CREATE_PRICE_MICRO = 100_000n   // $0.10 per CREATE, in USDC-micro units
export const CREATE_WEI_PER_TOKEN = 10n ** 18n // 1 CREATE in wei

export function computeCombinedScore(
  boostAmount: bigint,
  upvoteWeight: bigint,
  downvoteWeight: bigint,
): bigint {
  const netCreate = upvoteWeight - downvoteWeight // signed, in CREATE wei
  // Scale: (netCreate * CREATE_PRICE_MICRO) / CREATE_WEI_PER_TOKEN
  const netCreateUsdc = (netCreate * CREATE_PRICE_MICRO) / CREATE_WEI_PER_TOKEN
  const raw = boostAmount + netCreateUsdc
  return raw > 0n ? raw : 0n
}

/**
 * Token Vote Feed Generator
 *
 * Creates custom feeds that rank posts by token vote weight.
 * Each feed is parameterized by a token contract address.
 *
 * Feed URI format: at://{did}/app.bsky.feed.generator/token-{tokenAddress}
 */
export class TestTokenVoteFeedGen {
  destroyed = false
  postWeights: Map<string, Map<string, VoteWeight>> = new Map() // tokenAddress -> (subjectUri -> weight)

  constructor(
    public port: number,
    public server: http.Server,
    public did: string,
    public tokenVoteAppviewUrl: string,
  ) { }

  static async create(cfg: TokenVoteFeedGenConfig): Promise<TestTokenVoteFeedGen> {
    const port = cfg.port ?? (await getPort())
    // Use provided DID or create a new one
    const did = cfg.did ?? await createFeedGenDid(cfg.plcUrl, port)
    const app = express()
    app.use(express.json())

    // Enable CORS for browser access
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Content-Type')
      next()
    })

    const feedGen = new TestTokenVoteFeedGen(port, null as unknown as http.Server, did, cfg.tokenVoteAppviewUrl)

    const lexServer = createLexiconServer()

    // getFeedSkeleton - returns posts ranked by token vote weight
    lexServer.app.bsky.feed.getFeedSkeleton(async (args) => {
      const feedUri = args.params.feed
      const tokenAddress = feedGen.extractTokenAddress(feedUri)

      if (!tokenAddress) {
        throw new InvalidRequestError('Invalid feed URI - expected token-{address} format', 'InvalidFeed')
      }

      const limit = Math.min(args.params.limit ?? 50, 100)
      const cursor = args.params.cursor

      // Get ranked posts for this token
      const rankedPosts = feedGen.getRankedPosts(tokenAddress, limit, cursor)

      return {
        encoding: 'application/json',
        body: {
          feed: rankedPosts.posts.map((p) => ({ post: p.uri })),
          cursor: rankedPosts.cursor,
        },
      }
    })

    // describeFeedGenerator - lists available token feeds
    lexServer.app.bsky.feed.describeFeedGenerator(async () => {
      const tokenAddresses = Array.from(feedGen.postWeights.keys())
      return {
        encoding: 'application/json',
        body: {
          did,
          feeds: tokenAddresses.map((addr) => ({
            uri: `at://${did}/app.bsky.feed.generator/token-${addr}`,
          })),
        },
      }
    })

    app.use(lexServer.xrpc.router)

    // Additional endpoint to register/update vote weights
    app.post('/admin/update-weights', (req, res) => {
      const { tokenAddress, subjectUri, upvoteWeight, downvoteWeight, boostAmount } = req.body as {
        tokenAddress: string
        subjectUri: string
        upvoteWeight: string
        downvoteWeight: string
        boostAmount?: string
      }

      feedGen.updateWeight(tokenAddress, subjectUri, upvoteWeight, downvoteWeight, boostAmount)
      res.json({ success: true })
    })

    // Register a post in the feed without a vote (appears with 0 weight initially)
    app.post('/admin/register-post', (req, res) => {
      const { tokenAddress, subjectUri, boostAmount } = req.body as {
        tokenAddress: string
        subjectUri: string
        boostAmount?: string
      }

      if (!tokenAddress || !subjectUri) {
        return res.status(400).json({ error: 'Missing tokenAddress or subjectUri' })
      }

      // Only register if not already in the feed
      const addr = tokenAddress.toLowerCase()
      if (!feedGen.postWeights.has(addr)) {
        feedGen.postWeights.set(addr, new Map())
      }
      const weights = feedGen.postWeights.get(addr)!
      if (!weights.has(subjectUri)) {
        const boost = boostAmount ? BigInt(boostAmount) : 0n
        weights.set(subjectUri, {
          subjectUri,
          upvoteWeight: 0n,
          downvoteWeight: 0n,
          boostAmount: boost,
          combinedScore: computeCombinedScore(boost, 0n, 0n),
        })
      }
      res.json({ success: true })
    })

    const server = app.listen(port)
    await events.once(server, 'listening')

    feedGen.server = server as unknown as http.Server
    return feedGen
  }

  /**
   * Extract token address from feed URI
   * e.g., at://did:plc:xxx/app.bsky.feed.generator/token-0x1234... → 0x1234...
   */
  extractTokenAddress(feedUri: string): string | null {
    const match = feedUri.match(/\/token-(.+)$/)
    return match ? match[1] : null
  }

  /**
   * Update the weight for a post under a specific token.
   * boostAmount is optional — if omitted, the existing boost is preserved.
   */
  updateWeight(
    tokenAddress: string,
    subjectUri: string,
    upvoteWeight: string,
    downvoteWeight: string,
    boostAmount?: string,
  ): void {
    const addr = tokenAddress.toLowerCase()
    if (!this.postWeights.has(addr)) {
      this.postWeights.set(addr, new Map())
    }

    const existing = this.postWeights.get(addr)!.get(subjectUri)
    const boost = boostAmount !== undefined
      ? BigInt(boostAmount)
      : (existing?.boostAmount ?? 0n)
    const upBig = BigInt(upvoteWeight)
    const downBig = BigInt(downvoteWeight)

    this.postWeights.get(addr)!.set(subjectUri, {
      subjectUri,
      upvoteWeight: upBig,
      downvoteWeight: downBig,
      boostAmount: boost,
      combinedScore: computeCombinedScore(boost, upBig, downBig),
    })
  }

  /**
   * Get posts ranked by combined score (boost + CREATE vote value) for a token
   */
  getRankedPosts(
    tokenAddress: string,
    limit: number,
    cursor?: string,
  ): { posts: { uri: string; score: bigint }[]; cursor?: string } {
    const addr = tokenAddress.toLowerCase()
    const weights = this.postWeights.get(addr)

    if (!weights) {
      return { posts: [] }
    }

    // Sort by combinedScore descending (include all registered posts, even score=0)
    const sorted = Array.from(weights.values())
      .sort((a, b) => {
        if (b.combinedScore > a.combinedScore) return 1
        if (b.combinedScore < a.combinedScore) return -1
        return 0
      })

    // Apply cursor (simple offset-based)
    let startIdx = 0
    if (cursor) {
      const idx = parseInt(cursor, 10)
      if (!isNaN(idx)) {
        startIdx = idx
      }
    }

    const sliced = sorted.slice(startIdx, startIdx + limit)
    const nextCursor = startIdx + sliced.length < sorted.length ? String(startIdx + sliced.length) : undefined

    return {
      posts: sliced.map((w) => ({ uri: w.subjectUri, score: w.combinedScore })),
      cursor: nextCursor,
    }
  }

  /**
   * Get all registered token addresses
   */
  getTokenAddresses(): string[] {
    return Array.from(this.postWeights.keys())
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) return resolve()
      this.server.close((err) => {
        if (err) return reject(err)
        this.destroyed = true
        resolve()
      })
    })
  }
}

async function createFeedGenDid(plcUrl: string, port: number): Promise<string> {
  const keypair = await Secp256k1Keypair.create()
  const plcClient = new plc.Client(plcUrl)
  const op = await plc.signOperation(
    {
      type: 'plc_operation',
      verificationMethods: {
        atproto: keypair.did(),
      },
      rotationKeys: [keypair.did()],
      alsoKnownAs: [],
      services: {
        bsky_fg: {
          type: 'BskyFeedGenerator',
          endpoint: `http://localhost:${port}`,
        },
      },
      prev: null,
    },
    keypair,
  )
  const did = await plc.didForCreateOp(op)
  await plcClient.sendOperation(did, op)
  return did
}
