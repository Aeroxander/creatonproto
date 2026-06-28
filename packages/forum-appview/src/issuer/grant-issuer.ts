import { createHash, randomUUID } from 'node:crypto'
import {
    Aes256Gcm,
    CipherSuite,
    DhkemP256HkdfSha256,
    HkdfSha256,
} from '@hpke/core'
import type { ForumEntitlementTable } from '../db/schema'
import { IssuerAccessStore } from './access-store'
import { EpochKeyStore, type EpochKey } from './epoch-key-store'
import type { VerifiedSession } from './wallet-auth'
import type { ForumGrantPublisher } from './grant-publisher'

const SUITE = 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM'
const INFO = new TextEncoder().encode('app.creaton.forum.sarma.v2')
const MAX_KEYS_PER_GRANT = 256

export interface IssuedKeyGrant {
    grantId: string
    boardUri: string
    sessionKeyHash: string
    certificateHash: string
    epochFrom: string
    epochTo: string
    expiresAt: string
    version: 2
    suite: typeof SUITE
    enc: string
    ciphertext: string
    keyCommitment: string
    createdAt: string
}

export class ForumGrantIssuer {
    constructor(
        private readonly issuerDid: string,
        private readonly accessStore: IssuerAccessStore,
        private readonly epochKeys: EpochKeyStore,
        private readonly publisher?: ForumGrantPublisher,
    ) {}

    async issue(input: {
        boardUri: string
        did: string
        entitlement: ForumEntitlementTable
        session: VerifiedSession
        now?: Date
    }): Promise<IssuedKeyGrant[]> {
        const now = input.now ?? new Date()
        const currentEpoch = now.toISOString().slice(0, 10)
        await this.epochKeys.getOrCreate(input.boardUri, currentEpoch)
        const keys = await this.epochKeys.listAllThrough(input.boardUri, currentEpoch)
        const boardRef = this.publisher
            ? await this.accessStore.getBoardRef(input.boardUri)
            : undefined
        if (this.publisher && !boardRef) {
            throw new Error('Cannot publish a key grant before the protected board CID is indexed')
        }
        const expiresAt = new Date(Math.min(
            new Date(input.entitlement.expires_at).getTime(),
            input.session.expiresAt.getTime(),
        ))
        if (expiresAt <= now) throw new Error('Forum access has expired')

        const grants: IssuedKeyGrant[] = []
        for (let offset = 0; offset < keys.length; offset += MAX_KEYS_PER_GRANT) {
            const chunk = keys.slice(offset, offset + MAX_KEYS_PER_GRANT)
            grants.push(await this.sealChunk({ ...input, keys: chunk, expiresAt, now, boardRef }))
        }
        return grants
    }

    private async sealChunk(input: {
        boardUri: string
        did: string
        entitlement: ForumEntitlementTable
        session: VerifiedSession
        keys: EpochKey[]
        expiresAt: Date
        now: Date
        boardRef?: { uri: string; cid: string }
    }): Promise<IssuedKeyGrant> {
        const first = input.keys[0]
        const last = input.keys.at(-1)
        if (!first || !last) throw new Error('Cannot issue an empty key grant')
        const grantId = randomUUID()
        const context = {
            issuerDid: this.issuerDid,
            boardUri: input.boardUri,
            grantId,
            sessionKeyHash: input.session.sessionKeyHash,
            certificateHash: input.session.certificateHash,
            epochFrom: first.epoch,
            epochTo: last.epoch,
            expiresAt: input.expiresAt.toISOString(),
        }
        const plaintext = canonicalBytes({
            epochs: input.keys.map(({ epoch, key }) => ({
                epoch,
                key: Buffer.from(key).toString('base64url'),
            })),
            version: 1,
        })
        const suite = createSuite()
        const recipientPublicKey = await suite.kem.deserializePublicKey(input.session.publicKey)
        const sealed = await suite.seal(
            { recipientPublicKey, info: INFO },
            plaintext,
            canonicalBytes({ application: 'app.creaton.forum.keyGrant', ...context, version: 2 }),
        )
        const createdAt = input.now.toISOString()
        const grant: IssuedKeyGrant = {
            grantId,
            boardUri: input.boardUri,
            sessionKeyHash: input.session.sessionKeyHash,
            certificateHash: input.session.certificateHash,
            epochFrom: first.epoch,
            epochTo: last.epoch,
            expiresAt: input.expiresAt.toISOString(),
            version: 2,
            suite: SUITE,
            enc: Buffer.from(sealed.enc).toString('base64url'),
            ciphertext: Buffer.from(sealed.ct).toString('base64url'),
            keyCommitment: createHash('sha256').update(plaintext).digest('base64url'),
            createdAt,
        }
        const uri = this.publisher && input.boardRef
            ? await this.publisher.publish(input.boardRef, grant)
            : undefined
        await this.accessStore.createGrantAudit({
            grantId,
            boardUri: input.boardUri,
            did: input.did,
            walletAddress: input.session.account,
            sessionKeyHash: input.session.sessionKeyHash,
            certificateHash: input.session.certificateHash,
            epochFrom: first.epoch,
            epochTo: last.epoch,
            expiresAt: input.expiresAt,
            uri,
            status: uri ? 'published' : 'issued',
        })
        return grant
    }
}

function createSuite(): CipherSuite {
    return new CipherSuite({
        kem: new DhkemP256HkdfSha256(),
        kdf: new HkdfSha256(),
        aead: new Aes256Gcm(),
    })
}

function canonicalBytes(value: unknown): Uint8Array {
    return new TextEncoder().encode(canonicalJson(value))
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
}
