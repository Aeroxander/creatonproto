export type KmsReleaseResponse = {
    receipt: {
        requestId: string
        requestHash: string
        boardUri: string
        subjectHash: string
        committeeEpoch: number
        eligibilityBlock: string
        policyHash: string
        expiresAt: string
    }
    shares: Array<Record<string, unknown>>
}

export type KmsEncryptionParameters = {
    committeeEpoch: number
    committeePublicKey: string
    verificationShares: string[]
}

export class ForumKmsClient {
    private readonly endpoints: URL[]

    constructor(
        endpoints: string | undefined,
        private readonly bearerToken?: string,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {
        this.endpoints = [...new Set((endpoints ?? '').split(',').map((value) => value.trim()).filter(Boolean))]
            .map((value) => {
                const endpoint = new URL(value)
                if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('KMS endpoint must use HTTP(S)')
                return endpoint
            })
        if (this.endpoints.length === 0) throw new Error('At least one KMS endpoint is required')
    }

    async requestRelease(input: Record<string, unknown>): Promise<KmsReleaseResponse> {
        const results = await Promise.allSettled(this.endpoints.map((endpoint) => this.requestPartial(endpoint, input)))
        const valid = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
        const groups = new Map<string, Array<{ receipt: KmsReleaseResponse['receipt'], share: Record<string, unknown> }>>()
        for (const result of valid) {
            const key = JSON.stringify(result.receipt)
            const values = groups.get(key) ?? []
            values.push(result)
            groups.set(key, values)
        }
        const quorum = [...groups.values()].find((values) => {
            const operators = new Set(values.map(({ share }) => share.operatorId))
            const indices = new Set(values.map(({ share }) => share.shareIndex))
            return values.length >= 10 && operators.size >= 10 && indices.size >= 10
        })
        if (!quorum) {
            const failures = results.length - valid.length
            throw new Error(`KMS threshold unavailable: ${valid.length} matching responses, ${failures} failures`)
        }
        return { receipt: quorum[0].receipt, shares: quorum.slice(0, 10).map(({ share }) => share) }
    }

    async getEncryptionParameters(): Promise<KmsEncryptionParameters> {
        const results = await Promise.allSettled(this.endpoints.map(async endpoint => {
            const response = await this.fetchImpl(new URL('/v1/encryption-parameters', endpoint), {
                signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) throw new Error(`KMS parameters failed: ${response.status}`)
            return response.json() as Promise<KmsEncryptionParameters>
        }))
        const groups = new Map<string, KmsEncryptionParameters[]>()
        for (const result of results) {
            if (result.status !== 'fulfilled' || result.value.verificationShares?.length !== 15) continue
            const key = JSON.stringify(result.value)
            groups.set(key, [...(groups.get(key) ?? []), result.value])
        }
        const quorum = [...groups.values()].find(values => values.length >= 10)
        if (!quorum) throw new Error('KMS encryption parameters did not reach a 10-node quorum')
        return quorum[0]
    }

    private async requestPartial(endpoint: URL, input: Record<string, unknown>): Promise<{
        receipt: KmsReleaseResponse['receipt']
        share: Record<string, unknown>
    }> {
        const response = await this.fetchImpl(new URL('/v1/partials', endpoint), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(20_000),
        })
        const body = await response.json().catch(() => undefined) as {
            receipt?: KmsReleaseResponse['receipt']
            share?: Record<string, unknown>
            error?: string
        } | undefined
        if (!response.ok) throw new Error(`KMS partial failed: ${body?.error ?? response.status}`)
        if (!body?.receipt || !body.share || typeof body.share.operatorId !== 'string' ||
            !Number.isInteger(body.share.shareIndex)) {
            throw new Error('KMS returned an invalid partial response')
        }
        if (body.share.requestHash !== body.receipt.requestHash ||
            body.share.committeeEpoch !== body.receipt.committeeEpoch) {
            throw new Error('KMS partial does not match its access receipt')
        }
        return { receipt: body.receipt, share: body.share }
    }
}
