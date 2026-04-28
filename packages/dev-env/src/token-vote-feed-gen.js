"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestTokenVoteFeedGen = exports.CREATE_WEI_PER_TOKEN = exports.CREATE_PRICE_MICRO = void 0;
exports.computeCombinedScore = computeCombinedScore;
const node_events_1 = __importDefault(require("node:events"));
const plc = __importStar(require("@did-plc/lib"));
const express_1 = __importDefault(require("express"));
const get_port_1 = __importDefault(require("get-port"));
const crypto_1 = require("@creatonproto/crypto");
const pds_1 = require("@creatonproto/pds");
const xrpc_server_1 = require("@creatonproto/xrpc-server");
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
exports.CREATE_PRICE_MICRO = 100000n; // $0.10 per CREATE, in USDC-micro units
exports.CREATE_WEI_PER_TOKEN = 10n ** 18n; // 1 CREATE in wei
function computeCombinedScore(boostAmount, upvoteWeight, downvoteWeight) {
    const netCreate = upvoteWeight - downvoteWeight; // signed, in CREATE wei
    // Scale: (netCreate * CREATE_PRICE_MICRO) / CREATE_WEI_PER_TOKEN
    const netCreateUsdc = (netCreate * exports.CREATE_PRICE_MICRO) / exports.CREATE_WEI_PER_TOKEN;
    const raw = boostAmount + netCreateUsdc;
    return raw > 0n ? raw : 0n;
}
/**
 * Token Vote Feed Generator
 *
 * Creates custom feeds that rank posts by token vote weight.
 * Each feed is parameterized by a token contract address.
 *
 * Feed URI format: at://{did}/app.bsky.feed.generator/token-{tokenAddress}
 */
class TestTokenVoteFeedGen {
    constructor(port, server, did, tokenVoteAppviewUrl) {
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "server", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: server
        });
        Object.defineProperty(this, "did", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: did
        });
        Object.defineProperty(this, "tokenVoteAppviewUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: tokenVoteAppviewUrl
        });
        Object.defineProperty(this, "destroyed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "postWeights", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // tokenAddress -> (subjectUri -> weight)
    }
    static async create(cfg) {
        const port = cfg.port ?? (await (0, get_port_1.default)());
        // Use provided DID or create a new one
        const did = cfg.did ?? await createFeedGenDid(cfg.plcUrl, port);
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        // Enable CORS for browser access
        app.use((_req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });
        const feedGen = new TestTokenVoteFeedGen(port, null, did, cfg.tokenVoteAppviewUrl);
        const lexServer = (0, pds_1.createLexiconServer)();
        // getFeedSkeleton - returns posts ranked by token vote weight
        lexServer.app.bsky.feed.getFeedSkeleton(async (args) => {
            const feedUri = args.params.feed;
            const tokenAddress = feedGen.extractTokenAddress(feedUri);
            if (!tokenAddress) {
                throw new xrpc_server_1.InvalidRequestError('Invalid feed URI - expected token-{address} format', 'InvalidFeed');
            }
            const limit = Math.min(args.params.limit ?? 50, 100);
            const cursor = args.params.cursor;
            // Get ranked posts for this token
            const rankedPosts = feedGen.getRankedPosts(tokenAddress, limit, cursor);
            return {
                encoding: 'application/json',
                body: {
                    feed: rankedPosts.posts.map((p) => ({ post: p.uri })),
                    cursor: rankedPosts.cursor,
                },
            };
        });
        // describeFeedGenerator - lists available token feeds
        lexServer.app.bsky.feed.describeFeedGenerator(async () => {
            const tokenAddresses = Array.from(feedGen.postWeights.keys());
            return {
                encoding: 'application/json',
                body: {
                    did,
                    feeds: tokenAddresses.map((addr) => ({
                        uri: `at://${did}/app.bsky.feed.generator/token-${addr}`,
                    })),
                },
            };
        });
        app.use(lexServer.xrpc.router);
        // Additional endpoint to register/update vote weights
        app.post('/admin/update-weights', (req, res) => {
            const { tokenAddress, subjectUri, upvoteWeight, downvoteWeight, boostAmount } = req.body;
            feedGen.updateWeight(tokenAddress, subjectUri, upvoteWeight, downvoteWeight, boostAmount);
            res.json({ success: true });
        });
        // Register a post in the feed without a vote (appears with 0 weight initially)
        app.post('/admin/register-post', (req, res) => {
            const { tokenAddress, subjectUri, boostAmount } = req.body;
            if (!tokenAddress || !subjectUri) {
                return res.status(400).json({ error: 'Missing tokenAddress or subjectUri' });
            }
            // Only register if not already in the feed
            const addr = tokenAddress.toLowerCase();
            if (!feedGen.postWeights.has(addr)) {
                feedGen.postWeights.set(addr, new Map());
            }
            const weights = feedGen.postWeights.get(addr);
            if (!weights.has(subjectUri)) {
                const boost = boostAmount ? BigInt(boostAmount) : 0n;
                weights.set(subjectUri, {
                    subjectUri,
                    upvoteWeight: 0n,
                    downvoteWeight: 0n,
                    boostAmount: boost,
                    combinedScore: computeCombinedScore(boost, 0n, 0n),
                });
            }
            res.json({ success: true });
        });
        const server = app.listen(port);
        await node_events_1.default.once(server, 'listening');
        feedGen.server = server;
        return feedGen;
    }
    /**
     * Extract token address from feed URI
     * e.g., at://did:plc:xxx/app.bsky.feed.generator/token-0x1234... → 0x1234...
     */
    extractTokenAddress(feedUri) {
        const match = feedUri.match(/\/token-(.+)$/);
        return match ? match[1] : null;
    }
    /**
     * Update the weight for a post under a specific token.
     * boostAmount is optional — if omitted, the existing boost is preserved.
     */
    updateWeight(tokenAddress, subjectUri, upvoteWeight, downvoteWeight, boostAmount) {
        const addr = tokenAddress.toLowerCase();
        if (!this.postWeights.has(addr)) {
            this.postWeights.set(addr, new Map());
        }
        const existing = this.postWeights.get(addr).get(subjectUri);
        const boost = boostAmount !== undefined
            ? BigInt(boostAmount)
            : (existing?.boostAmount ?? 0n);
        const upBig = BigInt(upvoteWeight);
        const downBig = BigInt(downvoteWeight);
        this.postWeights.get(addr).set(subjectUri, {
            subjectUri,
            upvoteWeight: upBig,
            downvoteWeight: downBig,
            boostAmount: boost,
            combinedScore: computeCombinedScore(boost, upBig, downBig),
        });
    }
    /**
     * Get posts ranked by combined score (boost + CREATE vote value) for a token
     */
    getRankedPosts(tokenAddress, limit, cursor) {
        const addr = tokenAddress.toLowerCase();
        const weights = this.postWeights.get(addr);
        if (!weights) {
            return { posts: [] };
        }
        // Sort by combinedScore descending (include all registered posts, even score=0)
        const sorted = Array.from(weights.values())
            .sort((a, b) => {
            if (b.combinedScore > a.combinedScore)
                return 1;
            if (b.combinedScore < a.combinedScore)
                return -1;
            return 0;
        });
        // Apply cursor (simple offset-based)
        let startIdx = 0;
        if (cursor) {
            const idx = parseInt(cursor, 10);
            if (!isNaN(idx)) {
                startIdx = idx;
            }
        }
        const sliced = sorted.slice(startIdx, startIdx + limit);
        const nextCursor = startIdx + sliced.length < sorted.length ? String(startIdx + sliced.length) : undefined;
        return {
            posts: sliced.map((w) => ({ uri: w.subjectUri, score: w.combinedScore })),
            cursor: nextCursor,
        };
    }
    /**
     * Get all registered token addresses
     */
    getTokenAddresses() {
        return Array.from(this.postWeights.keys());
    }
    close() {
        return new Promise((resolve, reject) => {
            if (this.destroyed)
                return resolve();
            this.server.close((err) => {
                if (err)
                    return reject(err);
                this.destroyed = true;
                resolve();
            });
        });
    }
}
exports.TestTokenVoteFeedGen = TestTokenVoteFeedGen;
async function createFeedGenDid(plcUrl, port) {
    const keypair = await crypto_1.Secp256k1Keypair.create();
    const plcClient = new plc.Client(plcUrl);
    const op = await plc.signOperation({
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
    }, keypair);
    const did = await plc.didForCreateOp(op);
    await plcClient.sendOperation(did, op);
    return did;
}
//# sourceMappingURL=token-vote-feed-gen.js.map