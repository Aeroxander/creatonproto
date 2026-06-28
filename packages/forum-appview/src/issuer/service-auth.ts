import { DidResolver } from '@atproto/identity'
import { verifyJwt } from '@atproto/xrpc-server'
import { IssuerAccessStore } from './access-store'

const MAX_JWT_AGE_SECONDS = 5 * 60

type JwtClaims = {
    iss?: unknown
    iat?: unknown
    exp?: unknown
    jti?: unknown
}

export class ForumServiceAuth {
    private readonly resolver: DidResolver

    constructor(
        private readonly serviceDid: string,
        private readonly accessStore: IssuerAccessStore,
        plcUrl = 'https://plc.directory',
    ) {
        this.resolver = new DidResolver({ plcUrl, timeout: 5_000 })
    }

    async authenticate(authorization: string | undefined, method: string): Promise<{
        did: string
        nonce: string
        expiresAt: Date
    }> {
        const bearer = /(?:^|,)\s*Bearer\s+([^,\s]+)/i.exec(authorization ?? '')?.[1]
        if (!bearer) {
            throw new Error('Missing ATProto service-auth bearer token')
        }
        const jwt = bearer
        const decoded = decodeJwtClaims(jwt)
        const now = Math.floor(Date.now() / 1_000)
        if (
            typeof decoded.iss !== 'string' || decoded.iss.includes('#') ||
            typeof decoded.iat !== 'number' || !Number.isInteger(decoded.iat) ||
            typeof decoded.exp !== 'number' || !Number.isInteger(decoded.exp) ||
            typeof decoded.jti !== 'string' || decoded.jti.length < 16 || decoded.jti.length > 128 ||
            decoded.iat > now + 30 || decoded.iat < now - MAX_JWT_AGE_SECONDS ||
            decoded.exp <= now || decoded.exp > decoded.iat + MAX_JWT_AGE_SECONDS
        ) {
            throw new Error('Invalid ATProto service-auth claims')
        }

        const verified = await verifyJwt(
            jwt,
            this.serviceDid,
            method,
            async (issuer, forceRefresh) => this.resolver.resolveAtprotoKey(issuer, forceRefresh),
        )
        if (verified.iss !== decoded.iss) throw new Error('Service-auth issuer mismatch')

        return {
            did: decoded.iss,
            nonce: `service:${decoded.iss}:${decoded.jti}`,
            expiresAt: new Date(decoded.exp * 1_000),
        }
    }

    async consume(credentials: { nonce: string; expiresAt: Date }): Promise<void> {
        const unique = await this.accessStore.claimNonce(
            credentials.nonce,
            'service-jwt',
            credentials.expiresAt,
        )
        if (!unique) throw new Error('Replayed ATProto service-auth JWT')
    }
}

function decodeJwtClaims(jwt: string): JwtClaims {
    const parts = jwt.split('.')
    if (parts.length !== 3) throw new Error('Malformed ATProto service-auth JWT')
    try {
        const value = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
        return value as JwtClaims
    } catch {
        throw new Error('Malformed ATProto service-auth JWT claims')
    }
}
