import type { IssuedKeyGrant } from './grant-issuer'

const KEY_GRANT_COLLECTION = 'app.creaton.forum.keyGrant'

export interface ForumGrantPublisher {
    publish(board: { uri: string; cid: string }, grant: IssuedKeyGrant): Promise<string>
}

export class AtprotoGrantPublisher implements ForumGrantPublisher {
    private refreshPromise?: Promise<void>

    private constructor(
        private readonly service: string,
        private readonly did: string,
        private accessJwt: string,
        private refreshJwt: string,
        private readonly fetchImpl: typeof fetch,
    ) {}

    static async login(input: {
        service: string
        identifier: string
        appPassword: string
        expectedDid: string
        fetchImpl?: typeof fetch
    }): Promise<AtprotoGrantPublisher> {
        const service = input.service.replace(/\/$/, '')
        const fetchImpl = input.fetchImpl ?? fetch
        const response = await fetchImpl(`${service}/xrpc/com.atproto.server.createSession`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ identifier: input.identifier, password: input.appPassword }),
            signal: AbortSignal.timeout(15_000),
        })
        const session = await readJson(response) as {
            did?: unknown
            accessJwt?: unknown
            refreshJwt?: unknown
        }
        if (
            !response.ok || session.did !== input.expectedDid ||
            typeof session.accessJwt !== 'string' || typeof session.refreshJwt !== 'string'
        ) {
            throw new Error('Issuer PDS login failed or returned the wrong DID')
        }
        return new AtprotoGrantPublisher(
            service,
            session.did,
            session.accessJwt,
            session.refreshJwt,
            fetchImpl,
        )
    }

    async publish(board: { uri: string; cid: string }, grant: IssuedKeyGrant): Promise<string> {
        const record = {
            $type: KEY_GRANT_COLLECTION,
            board,
            grantId: grant.grantId,
            sessionKeyHash: bytes(grant.sessionKeyHash),
            certificateHash: bytes(grant.certificateHash),
            epochFrom: grant.epochFrom,
            epochTo: grant.epochTo,
            expiresAt: grant.expiresAt,
            version: grant.version,
            suite: grant.suite,
            enc: bytes(grant.enc),
            ciphertext: bytes(grant.ciphertext),
            keyCommitment: bytes(grant.keyCommitment),
            createdAt: grant.createdAt,
        }
        let response = await this.createRecord(record)
        if (response.status === 401) {
            await this.refresh()
            response = await this.createRecord(record)
        }
        const result = await readJson(response) as { uri?: unknown }
        if (!response.ok || typeof result.uri !== 'string') {
            throw new Error(`Issuer key-grant publication failed with HTTP ${response.status}`)
        }
        return result.uri
    }

    private createRecord(record: Record<string, unknown>): Promise<Response> {
        return this.fetchImpl(`${this.service}/xrpc/com.atproto.repo.createRecord`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${this.accessJwt}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                repo: this.did,
                collection: KEY_GRANT_COLLECTION,
                record,
            }),
            signal: AbortSignal.timeout(15_000),
        })
    }

    private async refresh(): Promise<void> {
        if (!this.refreshPromise) {
            this.refreshPromise = this.doRefresh().finally(() => {
                this.refreshPromise = undefined
            })
        }
        await this.refreshPromise
    }

    private async doRefresh(): Promise<void> {
        const response = await this.fetchImpl(`${this.service}/xrpc/com.atproto.server.refreshSession`, {
            method: 'POST',
            headers: { authorization: `Bearer ${this.refreshJwt}` },
            signal: AbortSignal.timeout(15_000),
        })
        const session = await readJson(response) as {
            did?: unknown
            accessJwt?: unknown
            refreshJwt?: unknown
        }
        if (
            !response.ok || session.did !== this.did ||
            typeof session.accessJwt !== 'string' || typeof session.refreshJwt !== 'string'
        ) throw new Error('Issuer PDS session refresh failed')
        this.accessJwt = session.accessJwt
        this.refreshJwt = session.refreshJwt
    }
}

function bytes(value: string): { $bytes: string } {
    return { $bytes: Buffer.from(value, 'base64url').toString('base64') }
}

async function readJson(response: Response): Promise<unknown> {
    return response.json().catch(() => ({}))
}
