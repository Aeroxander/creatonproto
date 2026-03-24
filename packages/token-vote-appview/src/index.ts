import express from 'express'
import { config } from './config'
import { createDb, migrateDb } from './db/schema'
import { EvmRpcClient } from './evm/rpc'
import { VoteProcessor } from './indexer/vote-processor'
import { TapConsumer } from './indexer/tap-consumer'
import { DailySnapshotJob } from './jobs/daily-snapshot'
import { createRouter } from './api/routes'
import { FeedGenClient } from './feed-gen-client'

async function main() {
    console.log('Starting Token Vote AppView...')
    console.log(`Config:`)
    console.log(`  PORT: ${config.PORT}`)
    console.log(`  TAP_URL: ${config.TAP_URL}`)
    console.log(`  RPC_URL: ${config.RPC_URL}`)
    console.log(`  DATABASE_URL: ${config.DATABASE_URL}`)
    console.log(`  FEED_GEN_URL: ${config.FEED_GEN_URL ?? 'not configured'}`)

    // Initialize database
    const dbPath = config.DATABASE_URL.replace('sqlite://', '')
    const db = createDb(dbPath)
    await migrateDb(db)
    console.log('Database initialized')

    // Initialize EVM RPC client
    const rpc = new EvmRpcClient(config.RPC_URL)

    // Initialize feed gen client (optional)
    const feedGenClient = config.FEED_GEN_URL
        ? new FeedGenClient(config.FEED_GEN_URL)
        : undefined

    // Initialize vote processor
    const processor = new VoteProcessor(db, rpc, feedGenClient)

    // Initialize TAP consumer
    const tapConsumer = new TapConsumer(
        config.TAP_URL,
        processor,
        config.TAP_ADMIN_PASSWORD,
    )

    // Start TAP consumer in background
    tapConsumer.start().catch((err) => {
        console.error('TAP consumer error:', err)
    })

    // Initialize and schedule daily snapshot job
    const snapshotJob = new DailySnapshotJob(db, rpc, feedGenClient)
    snapshotJob.schedule()

    // Create Express app
    const app = express()
    app.use(express.json())
    app.use(createRouter(db))

    // Start HTTP server
    const port = parseInt(config.PORT)
    app.listen(port, () => {
        console.log(`Token Vote AppView listening on port ${port}`)
    })
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})

export { main }
