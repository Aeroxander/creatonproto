import { Tap, SimpleIndexer, RecordEvent } from '@atproto/tap'
import { ForumProcessor } from './processor'

const INDEXED_COLLECTIONS = new Set([
    'app.creaton.forum.board',
    'app.creaton.forum.topic',
    'app.creaton.forum.comment',
    'app.creaton.forum.vote',
    'app.creaton.forum.member',
    'app.bsky.graph.follow',
])

export class TapConsumer {
    private tap: Tap
    private indexer: SimpleIndexer
    private processor: ForumProcessor

    constructor(tapUrl: string, processor: ForumProcessor, adminPassword?: string) {
        this.tap = new Tap(tapUrl, { adminPassword })
        this.indexer = new SimpleIndexer()
        this.processor = processor
        this.setupHandlers()
    }

    private setupHandlers() {
        this.indexer.record(async (evt: RecordEvent) => {
            if (!INDEXED_COLLECTIONS.has(evt.collection)) return
            const uri = `at://${evt.did}/${evt.collection}/${evt.rkey}`
            if (evt.action === 'create' || evt.action === 'update') {
                await this.processor.processRecord(
                    uri,
                    evt.did,
                    evt.collection,
                    evt.record as Record<string, unknown>,
                    evt.cid,
                )
            } else if (evt.action === 'delete') {
                await this.processor.deleteRecord(
                    uri,
                    evt.collection,
                    evt.did,
                    evt.record as Record<string, unknown>,
                )
            }
        })

        this.indexer.error((err) => {
            console.error('Forum TAP indexer error:', err)
        })
    }

    async start(): Promise<void> {
        console.log('Starting forum TAP consumer...')
        const channel = this.tap.channel(this.indexer)
        await channel.start()
    }
}
