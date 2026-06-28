export const config = {
    PORT: process.env.FORUM_APPVIEW_PORT ?? '3010',
    TAP_URL: process.env.TAP_URL ?? 'http://localhost:3000',
    TAP_ADMIN_PASSWORD: process.env.TAP_ADMIN_PASSWORD,
    DATABASE_URL: process.env.FORUM_DATABASE_URL ?? 'sqlite://./forum-appview.db',
    PAGERANK_DAMPING: Number(process.env.PAGERANK_DAMPING ?? '0.85'),
    PAGERANK_ITERATIONS: Number(process.env.PAGERANK_ITERATIONS ?? '20'),
    FORUM_SERVICE_DID: process.env.FORUM_SERVICE_DID,
    FORUM_MPP_SECRET: process.env.FORUM_MPP_SECRET,
    FORUM_MPP_SETTLER_PRIVATE_KEY: process.env.FORUM_MPP_SETTLER_PRIVATE_KEY,
    FORUM_REVENUE_ROUTER: process.env.FORUM_REVENUE_ROUTER,
    FORUM_KMS_ENDPOINT: process.env.FORUM_KMS_ENDPOINT,
    FORUM_KMS_ENDPOINTS: process.env.FORUM_KMS_ENDPOINTS,
    FORUM_KMS_BEARER_TOKEN: process.env.FORUM_KMS_BEARER_TOKEN,
    ABSTRACT_RPC_URL: process.env.ABSTRACT_RPC_URL ?? 'https://api.mainnet.abs.xyz',
    TEMPO_RPC_URL: process.env.TEMPO_RPC_URL ?? 'https://rpc.tempo.xyz',
    CREATON_DAO_TREASURY: process.env.CREATON_DAO_TREASURY,
    PLC_URL: process.env.PLC_URL ?? 'https://plc.directory',
    FORUM_OPERATOR_REGISTRY: process.env.FORUM_OPERATOR_REGISTRY,
    FORUM_REWARD_PDS_URL: process.env.FORUM_REWARD_PDS_URL,
    FORUM_REWARD_PDS_IDENTIFIER: process.env.FORUM_REWARD_PDS_IDENTIFIER,
    FORUM_REWARD_PDS_APP_PASSWORD: process.env.FORUM_REWARD_PDS_APP_PASSWORD,
    FORUM_REWARD_TRIGGER: process.env.FORUM_REWARD_TRIGGER,
    FORUM_REWARD_TRIGGER_PRIVATE_KEY: process.env.FORUM_REWARD_TRIGGER_PRIVATE_KEY,
    FORUM_DID_WALLET_REGISTRY: process.env.FORUM_DID_WALLET_REGISTRY,
    CROSSMINT_SERVER_API_KEY: process.env.CROSSMINT_SERVER_API_KEY,
    CROSSMINT_ENV: process.env.CROSSMINT_ENV === 'production' ? 'production' as const : 'staging' as const,
    CROSSMINT_TOKEN_LOCATOR: process.env.CROSSMINT_TOKEN_LOCATOR,
    CROSSMINT_ALLOWED_CHAIN_ID: Number(process.env.CROSSMINT_ALLOWED_CHAIN_ID ?? '11124'),
    CROSSMINT_MIN_AMOUNT_USD: Number(process.env.CROSSMINT_MIN_AMOUNT_USD ?? '1'),
    CROSSMINT_MAX_AMOUNT_USD: Number(process.env.CROSSMINT_MAX_AMOUNT_USD ?? '100'),
}

export function crossmintOnrampConfigured(): boolean {
    return Boolean(config.CROSSMINT_SERVER_API_KEY && config.CROSSMINT_TOKEN_LOCATOR)
}

export function crossmintOnrampConfig() {
    if (!config.CROSSMINT_SERVER_API_KEY || !config.CROSSMINT_TOKEN_LOCATOR) {
        throw new Error('Crossmint onramp is not configured')
    }
    return {
        serverApiKey: config.CROSSMINT_SERVER_API_KEY,
        env: config.CROSSMINT_ENV,
        tokenLocator: config.CROSSMINT_TOKEN_LOCATOR,
        allowedChainId: config.CROSSMINT_ALLOWED_CHAIN_ID,
        minAmountUsd: config.CROSSMINT_MIN_AMOUNT_USD,
        maxAmountUsd: config.CROSSMINT_MAX_AMOUNT_USD,
    }
}
