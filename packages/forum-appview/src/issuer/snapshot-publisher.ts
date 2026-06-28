import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const COLLECTION = 'app.creaton.forum.rewardSnapshot'
const MAX_CHUNK_BYTES = 4 * 1024 * 1024
const MAX_UNCOMPRESSED_CHUNK_BYTES = 3_900_000

export class AtprotoSnapshotPublisher {
    private refreshPromise?: Promise<void>
    private constructor(
        private readonly service: string,
        private readonly did: string,
        private accessJwt: string,
        private refreshJwt: string,
        private readonly fetchImpl: typeof fetch,
    ) {}

    static async login(input: { service: string; identifier: string; appPassword: string; expectedDid: string; fetchImpl?: typeof fetch }) {
        const service = input.service.replace(/\/$/, '')
        const fetchImpl = input.fetchImpl ?? fetch
        const response = await fetchImpl(`${service}/xrpc/com.atproto.server.createSession`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ identifier: input.identifier, password: input.appPassword }),
        })
        const session = await response.json() as { did?: string; accessJwt?: string; refreshJwt?: string }
        if (!response.ok || session.did !== input.expectedDid || !session.accessJwt || !session.refreshJwt) {
            throw new Error('Reward snapshot PDS login failed')
        }
        return new AtprotoSnapshotPublisher(service, session.did, session.accessJwt, session.refreshJwt, fetchImpl)
    }

    async publish(input: {
        board: { uri: string; cid: string }; epochId: number; startsAt: string; endsAt: string;
        cutoffBlock: bigint; dataset: Buffer; datasetHash: string; merkleRoot: string;
        totalAllocated: bigint; allocationCount: number;
    }): Promise<{ uri: string; cid: string }> {
        const chunks = chunkDataset(input.dataset)
        const uploaded = []
        for (let index = 0; index < chunks.length; ++index) {
            const data = chunks[index]
            const blob = await this.uploadBlob(data)
            uploaded.push({
                index, blob, sha256: bytes(createHash('sha256').update(data).digest('hex')),
                compressedBytes: data.length,
            })
        }
        const record = {
            $type: COLLECTION, board: input.board, epochId: input.epochId,
            startsAt: input.startsAt, endsAt: input.endsAt, cutoffBlock: input.cutoffBlock.toString(),
            datasetHash: bytes(input.datasetHash), merkleRoot: bytes(input.merkleRoot),
            totalAllocated: input.totalAllocated.toString(), allocationCount: input.allocationCount,
            chunks: uploaded, createdAt: new Date().toISOString(),
        }
        const result = await this.request('/xrpc/com.atproto.repo.createRecord', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ repo: this.did, collection: COLLECTION, record }),
        }) as { uri?: string; cid?: string }
        if (!result.uri || !result.cid) throw new Error('PDS did not return reward snapshot URI/CID')
        return { uri: result.uri, cid: result.cid }
    }

    private async uploadBlob(data: Buffer): Promise<unknown> {
        const result = await this.request('/xrpc/com.atproto.repo.uploadBlob', {
            method: 'POST', headers: { 'content-type': 'application/gzip' }, body: new Uint8Array(data),
        }) as { blob?: unknown }
        if (!result.blob) throw new Error('PDS blob upload did not return a blob reference')
        return result.blob
    }

    private async request(path: string, init: RequestInit): Promise<unknown> {
        let response = await this.fetchImpl(`${this.service}${path}`, {
            ...init, headers: { ...init.headers, authorization: `Bearer ${this.accessJwt}` },
            signal: AbortSignal.timeout(30_000),
        })
        if (response.status === 401) {
            await this.refresh()
            response = await this.fetchImpl(`${this.service}${path}`, {
                ...init, headers: { ...init.headers, authorization: `Bearer ${this.accessJwt}` },
                signal: AbortSignal.timeout(30_000),
            })
        }
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(`Reward snapshot PDS request failed with HTTP ${response.status}`)
        return json
    }

    private async refresh() {
        if (!this.refreshPromise) this.refreshPromise = this.doRefresh().finally(() => { this.refreshPromise = undefined })
        await this.refreshPromise
    }

    private async doRefresh() {
        const response = await this.fetchImpl(`${this.service}/xrpc/com.atproto.server.refreshSession`, {
            method: 'POST', headers: { authorization: `Bearer ${this.refreshJwt}` },
        })
        const session = await response.json() as { did?: string; accessJwt?: string; refreshJwt?: string }
        if (!response.ok || session.did !== this.did || !session.accessJwt || !session.refreshJwt) throw new Error('PDS refresh failed')
        this.accessJwt = session.accessJwt
        this.refreshJwt = session.refreshJwt
    }
}

export function chunkDataset(dataset: Buffer): Buffer[] {
    const lines = dataset.toString().split(/(?<=\n)/).filter(Boolean)
    const chunks: Buffer[] = []
    let current: string[] = []
    let currentBytes = 0
    for (const line of lines) {
        const lineBytes = Buffer.byteLength(line)
        if (lineBytes > MAX_UNCOMPRESSED_CHUNK_BYTES) throw new Error('A reward snapshot line exceeds the PDS chunk limit')
        if (currentBytes + lineBytes > MAX_UNCOMPRESSED_CHUNK_BYTES && current.length) {
            chunks.push(deterministicGzip(Buffer.from(current.join(''))))
            current = [line]
            currentBytes = lineBytes
        } else {
            current.push(line)
            currentBytes += lineBytes
        }
    }
    if (current.length) chunks.push(deterministicGzip(Buffer.from(current.join(''))))
    if (chunks.some((chunk) => chunk.length > MAX_CHUNK_BYTES)) throw new Error('A reward snapshot line exceeds the PDS chunk limit')
    return chunks
}

function deterministicGzip(value: Buffer): Buffer {
    return gzipSync(value, { level: 9, mtime: 0 } as Parameters<typeof gzipSync>[1])
}

function bytes(hex: string): { $bytes: string } {
    return { $bytes: Buffer.from(hex.replace(/^0x/, ''), 'hex').toString('base64') }
}
