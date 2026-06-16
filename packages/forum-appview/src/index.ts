import express from 'express'
import { config } from './config'
import { createDb, migrateDb } from './db/schema'
import { createRouter } from './api/routes'
import { ForumProcessor } from './indexer/processor'
import { TapConsumer } from './indexer/tap-consumer'
import { PageRankRefreshJob } from './jobs/pagerank-refresh'

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

    const app = express()
    app.use(express.json())
    app.use(createRouter(db))

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
