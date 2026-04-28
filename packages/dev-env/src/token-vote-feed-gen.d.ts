import http from 'node:http';
export interface TokenVoteFeedGenConfig {
    plcUrl: string;
    tokenVoteAppviewUrl: string;
    port?: number;
    did?: string;
}
interface VoteWeight {
    subjectUri: string;
    upvoteWeight: bigint;
    downvoteWeight: bigint;
    boostAmount: bigint;
    combinedScore: bigint;
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
export declare const CREATE_PRICE_MICRO = 100000n;
export declare const CREATE_WEI_PER_TOKEN: bigint;
export declare function computeCombinedScore(boostAmount: bigint, upvoteWeight: bigint, downvoteWeight: bigint): bigint;
/**
 * Token Vote Feed Generator
 *
 * Creates custom feeds that rank posts by token vote weight.
 * Each feed is parameterized by a token contract address.
 *
 * Feed URI format: at://{did}/app.bsky.feed.generator/token-{tokenAddress}
 */
export declare class TestTokenVoteFeedGen {
    port: number;
    server: http.Server;
    did: string;
    tokenVoteAppviewUrl: string;
    destroyed: boolean;
    postWeights: Map<string, Map<string, VoteWeight>>;
    constructor(port: number, server: http.Server, did: string, tokenVoteAppviewUrl: string);
    static create(cfg: TokenVoteFeedGenConfig): Promise<TestTokenVoteFeedGen>;
    /**
     * Extract token address from feed URI
     * e.g., at://did:plc:xxx/app.bsky.feed.generator/token-0x1234... → 0x1234...
     */
    extractTokenAddress(feedUri: string): string | null;
    /**
     * Update the weight for a post under a specific token.
     * boostAmount is optional — if omitted, the existing boost is preserved.
     */
    updateWeight(tokenAddress: string, subjectUri: string, upvoteWeight: string, downvoteWeight: string, boostAmount?: string): void;
    /**
     * Get posts ranked by combined score (boost + CREATE vote value) for a token
     */
    getRankedPosts(tokenAddress: string, limit: number, cursor?: string): {
        posts: {
            uri: string;
            score: bigint;
        }[];
        cursor?: string;
    };
    /**
     * Get all registered token addresses
     */
    getTokenAddresses(): string[];
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=token-vote-feed-gen.d.ts.map