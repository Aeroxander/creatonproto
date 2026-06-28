import express from 'express'
import { config } from './config'
import { createDb, migrateDb } from './db/schema'
import { createRouter } from './api/routes'
import { ForumProcessor } from './indexer/processor'
import { TapConsumer } from './indexer/tap-consumer'
import { PageRankRefreshJob } from './jobs/pagerank-refresh'
import { IssuerAccessStore } from './issuer/access-store'
import { createIssuerRouter } from './issuer/routes'
import { ForumServiceAuth } from './issuer/service-auth'
import { ForumWalletAuth } from './issuer/wallet-auth'
import { AbstractMppSettlementAdapter } from './issuer/mpp'
import { TempoMppSubscriptionAdapter } from './issuer/tempo'
import { ForumKmsClient } from './issuer/kms-client'
import type { Address, Hex } from 'viem'
import { AtprotoSnapshotPublisher } from './issuer/snapshot-publisher'
import { RewardSnapshotJob } from './jobs/reward-snapshot'
import { WalletAttestationJob } from './jobs/wallet-attestation'
import { SubscriptionRenewalJob } from './jobs/subscription-renewal'
import { createOnrampRouter } from './onramp/routes'
import { createBillingRouter } from './billing/routes'
import { crossmintOnrampConfigured, crossmintOnrampConfig } from './config'

async function main() {
    console.log('Starting Forum AppView...')
    console.log(`  PORT: ${config.PORT}`)
    console.log(`  TAP_URL: ${config.TAP_URL}`)
    console.log(`  DATABASE_URL: ${config.DATABASE_URL}`)

    const dbPath = config.DATABASE_URL.replace('sqlite://', '')
    const db = createDb(dbPath)
    await migrateDb(db)
    console.log('Database initialized')

    const processor = new ForumProcessor(db)
    const tapConsumer = new TapConsumer(config.TAP_URL, processor, config.TAP_ADMIN_PASSWORD)
    tapConsumer.start().catch((err) => {
        console.error('Forum TAP consumer error:', err)
    })

    const pageRankJob = new PageRankRefreshJob(db)
    pageRankJob.schedule()

    if (
        config.FORUM_SERVICE_DID && config.FORUM_OPERATOR_REGISTRY &&
        config.FORUM_REWARD_PDS_URL && config.FORUM_REWARD_PDS_IDENTIFIER &&
        config.FORUM_REWARD_PDS_APP_PASSWORD && config.FORUM_REWARD_TRIGGER &&
        config.FORUM_REWARD_TRIGGER_PRIVATE_KEY
    ) {
        const publisher = await AtprotoSnapshotPublisher.login({
            service: config.FORUM_REWARD_PDS_URL,
            identifier: config.FORUM_REWARD_PDS_IDENTIFIER,
            appPassword: config.FORUM_REWARD_PDS_APP_PASSWORD,
            expectedDid: config.FORUM_SERVICE_DID,
        })
        new RewardSnapshotJob(
            db,
            publisher,
            config.ABSTRACT_RPC_URL,
            config.FORUM_OPERATOR_REGISTRY as Address,
            config.FORUM_SERVICE_DID,
            config.FORUM_REWARD_PDS_URL,
            config.FORUM_REWARD_TRIGGER as Address,
            config.FORUM_REWARD_TRIGGER_PRIVATE_KEY as Hex,
        ).schedule()
        new WalletAttestationJob(
            db,
            config.ABSTRACT_RPC_URL,
            config.FORUM_REWARD_PDS_URL,
            config.FORUM_REWARD_TRIGGER as Address,
            config.FORUM_REWARD_TRIGGER_PRIVATE_KEY as Hex,
            config.FORUM_DID_WALLET_REGISTRY as Address | undefined,
        ).schedule()
        console.log('Weekly PDS reward snapshots enabled')
        console.log('WAVS DID-wallet attestations enabled')
    }

    const app = express()
    app.use(express.json())
    const issuerConfigured = Boolean(
        config.FORUM_SERVICE_DID || config.FORUM_MPP_SECRET ||
        config.FORUM_MPP_SETTLER_PRIVATE_KEY || config.FORUM_REVENUE_ROUTER ||
        config.FORUM_KMS_ENDPOINTS || config.FORUM_KMS_ENDPOINT,
    )
    if (issuerConfigured) {
        if (
            !config.FORUM_SERVICE_DID || !config.FORUM_MPP_SECRET ||
            !config.FORUM_MPP_SETTLER_PRIVATE_KEY || !config.FORUM_REVENUE_ROUTER ||
            !(config.FORUM_KMS_ENDPOINTS || config.FORUM_KMS_ENDPOINT)
        ) {
            throw new Error(
                'The forum issuer requires its service DID, MPP secret, settler key, revenue router, and KMS endpoint',
            )
        }
        const accessStore = new IssuerAccessStore(db)
        app.use(createIssuerRouter({
            db,
            serviceDid: config.FORUM_SERVICE_DID,
            accessStore,
            serviceAuth: new ForumServiceAuth(config.FORUM_SERVICE_DID, accessStore, config.PLC_URL),
            walletAuth: new ForumWalletAuth(
                config.FORUM_SERVICE_DID,
                config.ABSTRACT_RPC_URL,
                config.PLC_URL,
                config.TEMPO_RPC_URL,
            ),
            settlement: new AbstractMppSettlementAdapter(
                config.FORUM_MPP_SECRET,
                config.FORUM_MPP_SETTLER_PRIVATE_KEY as Hex,
                config.ABSTRACT_RPC_URL,
            ),
            tempoSubscription: new TempoMppSubscriptionAdapter(
                config.FORUM_MPP_SECRET,
                config.FORUM_MPP_SETTLER_PRIVATE_KEY as Hex,
                config.TEMPO_RPC_URL,
            ),
            revenueRouter: config.FORUM_REVENUE_ROUTER as Address,
            kms: new ForumKmsClient(
                config.FORUM_KMS_ENDPOINTS || config.FORUM_KMS_ENDPOINT,
                config.FORUM_KMS_BEARER_TOKEN,
            ),
        }))
        new SubscriptionRenewalJob(db, accessStore).schedule()
        app.use(createBillingRouter({
            accessStore,
            crossmint: crossmintOnrampConfigured() ? crossmintOnrampConfig() : undefined,
        }))
        console.log(`Forum key issuer enabled for ${config.FORUM_SERVICE_DID}`)
    }
    app.use(createRouter(db))
    if (crossmintOnrampConfigured()) {
        app.use(createOnrampRouter({ config: crossmintOnrampConfig() }))
        console.log('Crossmint onramp enabled at POST /onramp/orders')
    }

    const port = parseInt(config.PORT)
    app.listen(port, () => {
        console.log(`Forum AppView listening on port ${port}`)
    })
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})

export { main }
