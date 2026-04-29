import { Tap, SimpleIndexer, RecordEvent } from '@atproto/tap'
import { VoteProcessor, TokenVoteRecord } from './vote-processor'

const TOKEN_VOTE_COLLECTION = 'app.creaton.feed.tokenVote'

export class TapConsumer {
    private tap: Tap
    private indexer: SimpleIndexer
    private processor: VoteProcessor

    constructor(tapUrl: string, processor: VoteProcessor, adminPassword?: string) {
        this.tap = new Tap(tapUrl, { adminPassword })
        this.indexer = new SimpleIndexer()
        this.processor = processor

        this.setupHandlers()
    }

    private setupHandlers() {
        this.indexer.record(async (evt: RecordEvent) => {
            // Only process tokenVote records
            if (evt.collection !== TOKEN_VOTE_COLLECTION) {
                return
            }

            const uri = `at://${evt.did}/${evt.collection}/${evt.rkey}`

            if (evt.action === 'create' || evt.action === 'update') {
                const record = evt.record as TokenVoteRecord['record']
                const cid = evt.cid || ''

                const result = await this.processor.processVote(uri, cid, evt.did, record)

                if (!result.success) {
                    console.warn(`Vote processing failed for ${uri}: ${result.error}`)
                } else {
                    console.log(`Processed vote: ${uri}`)
                }
            } else if (evt.action === 'delete') {
                await this.processor.deleteVote(uri)
                console.log(`Deleted vote: ${uri}`)
            }
        })

        this.indexer.identity(async (evt) => {
            console.log(`Identity update: ${evt.did} -> ${evt.handle} (${evt.status})`)
        })

        this.indexer.error((err) => {
            console.error('TAP indexer error:', err)
        })
    }

    async start(): Promise<void> {
        console.log('Starting TAP consumer...')
        const channel = this.tap.channel(this.indexer)
        await channel.start()
    }

    async addRepo(did: string): Promise<void> {
        await this.tap.addRepos([did])
    }
}
