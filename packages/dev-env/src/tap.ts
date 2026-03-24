import getPort from 'get-port'
import express, { Express } from 'express'
import { Server } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

export interface TestTapConfig {
    port?: number
    relayUrl?: string
    signalCollection?: string
    collectionFilters?: string[]
}

/**
 * A lightweight mock TAP server for dev-env.
 *
 * This provides the essential TAP HTTP API and WebSocket channel
 * without requiring the full Go TAP binary. It connects to a PDS
 * relay and forwards filtered events to connected clients.
 *
 * For production use, the full Go TAP service should be used instead:
 * https://github.com/bluesky-social/indigo/tree/main/cmd/tap
 */
export class TestTap {
    private app: Express
    private server?: Server
    private wss?: WebSocketServer
    private clients: Set<WebSocket> = new Set()
    private trackedDids: Set<string> = new Set()
    private eventIdCounter = 0

    constructor(
        public url: string,
        public port: number,
        public relayUrl: string,
        public signalCollection: string | undefined,
        public collectionFilters: string[],
    ) {
        this.app = express()
        this.app.use(express.json())
        this.setupRoutes()
    }

    static async create(cfg: TestTapConfig): Promise<TestTap> {
        const port = cfg.port ?? (await getPort())
        const url = `http://localhost:${port}`
        const relayUrl = cfg.relayUrl ?? 'ws://localhost:2583'
        const signalCollection = cfg.signalCollection
        const collectionFilters = cfg.collectionFilters ?? []

        const tap = new TestTap(url, port, relayUrl, signalCollection, collectionFilters)
        await tap.start()
        return tap
    }

    private setupRoutes() {
        // Health check
        this.app.get('/health', (_req, res) => {
            res.json({ status: 'ok' })
        })

        // Add repos to track
        this.app.post('/repos/add', (req, res) => {
            const dids = req.body?.dids as string[] | undefined
            if (!dids || !Array.isArray(dids)) {
                return res.status(400).json({ error: 'Missing dids array' })
            }
            for (const did of dids) {
                this.trackedDids.add(did)
            }
            res.json({ added: dids.length, total: this.trackedDids.size })
        })

        // Remove repos
        this.app.post('/repos/remove', (req, res) => {
            const dids = req.body?.dids as string[] | undefined
            if (!dids || !Array.isArray(dids)) {
                return res.status(400).json({ error: 'Missing dids array' })
            }
            for (const did of dids) {
                this.trackedDids.delete(did)
            }
            res.json({ removed: dids.length, total: this.trackedDids.size })
        })

        // Get repo count
        this.app.get('/stats/repo-count', (_req, res) => {
            res.json({ count: this.trackedDids.size })
        })

        // Get info about a tracked repo
        this.app.get('/info/:did', (req, res) => {
            const did = req.params.did
            if (this.trackedDids.has(did)) {
                res.json({ did, tracked: true, recordCount: 0 })
            } else {
                res.status(404).json({ error: 'Repo not tracked' })
            }
        })
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                // Set up WebSocket server on /channel
                this.wss = new WebSocketServer({ server: this.server, path: '/channel' })

                this.wss.on('connection', (ws) => {
                    this.clients.add(ws)
                    ws.on('close', () => this.clients.delete(ws))

                    // Handle ack messages from clients
                    ws.on('message', (data) => {
                        try {
                            const msg = JSON.parse(data.toString())
                            if (msg.type === 'ack') {
                                // Acknowledge received - in a real TAP this would update delivery state
                            }
                        } catch {
                            // Ignore invalid messages
                        }
                    })
                })

                resolve()
            })
        })
    }

    /**
     * Broadcast a record event to all connected clients.
     * This is used to simulate TAP forwarding events from the firehose.
     */
    broadcastRecordEvent(event: {
        did: string
        collection: string
        rkey: string
        action: 'create' | 'update' | 'delete'
        cid?: string
        record?: unknown
        live?: boolean
    }): void {
        // Check if we should filter this event
        if (this.collectionFilters.length > 0) {
            const matches = this.collectionFilters.some((filter) => {
                if (filter.includes('*')) {
                    const regex = new RegExp('^' + filter.replace(/\*/g, '.*') + '$')
                    return regex.test(event.collection)
                }
                return filter === event.collection
            })
            if (!matches) return
        }

        // Check if this DID is tracked (or if we're tracking all via signal collection)
        if (!this.signalCollection && !this.trackedDids.has(event.did)) {
            return
        }

        const tapEvent = {
            id: ++this.eventIdCounter,
            type: 'record',
            record: {
                live: event.live ?? true,
                rev: `${Date.now()}`,
                did: event.did,
                collection: event.collection,
                rkey: event.rkey,
                action: event.action,
                cid: event.cid,
                record: event.record,
            },
        }

        const message = JSON.stringify(tapEvent)
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message)
            }
        }
    }

    /**
     * Broadcast an identity event to all connected clients.
     */
    broadcastIdentityEvent(event: {
        did: string
        handle?: string
        isActive?: boolean
        status?: string
    }): void {
        const tapEvent = {
            id: ++this.eventIdCounter,
            type: 'identity',
            identity: {
                did: event.did,
                handle: event.handle,
                isActive: event.isActive ?? true,
                status: event.status ?? 'active',
            },
        }

        const message = JSON.stringify(tapEvent)
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message)
            }
        }
    }

    async close(): Promise<void> {
        // Close all WebSocket connections
        for (const client of this.clients) {
            client.close()
        }
        this.clients.clear()

        // Close WebSocket server
        if (this.wss) {
            this.wss.close()
        }

        // Close HTTP server
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
