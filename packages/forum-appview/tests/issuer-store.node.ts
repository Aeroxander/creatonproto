import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { Aes256Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core'
import { createDb, migrateDb, type Database } from '../src/db/schema'
import { IssuerAccessStore } from '../src/issuer/access-store'
import { EpochKeyStore } from '../src/issuer/epoch-key-store'
import { ForumProcessor } from '../src/indexer/processor'
import { AbstractFacilitatorAdapter, createPaymentRequired, encodePaymentRequired } from '../src/issuer/x402'
import { createKeyReleaseHandler } from '../src/issuer/routes'
import { deriveBoardPolicyHash, type AbstractMppSettlementAdapter } from '../src/issuer/mpp'
import type { ForumServiceAuth } from '../src/issuer/service-auth'
import type { ForumWalletAuth } from '../src/issuer/wallet-auth'
import { ForumGrantIssuer } from '../src/issuer/grant-issuer'
import { AtprotoGrantPublisher } from '../src/issuer/grant-publisher'

describe('issuer persistence', () => {
    let db: Kysely<Database>

    beforeEach(async () => {
        db = createDb(':memory:')
        await migrateDb(db)
    })

    afterEach(async () => {
        await db.destroy()
    })

    test('encrypts epoch keys at rest and returns the stable key', async () => {
        const store = new EpochKeyStore(db, randomBytes(32))
        const first = await store.getOrCreate('at://did:plc:owner/app.creaton.forum.board/paid', '2026-06-18')
        const second = await store.getOrCreate('at://did:plc:owner/app.creaton.forum.board/paid', '2026-06-18')
        const row = await db.selectFrom('forum_epoch_key').selectAll().executeTakeFirstOrThrow()

        assert.equal(Buffer.from(second.key).equals(Buffer.from(first.key)), true)
        assert.equal(row.encrypted_key.equals(Buffer.from(first.key)), false)
        assert.equal(row.nonce.byteLength, 12)
        assert.equal(row.auth_tag.byteLength, 16)
    })

    test('binds encrypted keys to their board and epoch with authenticated data', async () => {
        const store = new EpochKeyStore(db, randomBytes(32))
        await store.getOrCreate('at://did:plc:owner/app.creaton.forum.board/paid', '2026-06-18')
        await db
            .updateTable('forum_epoch_key')
            .set({ epoch: '2026-06-19' })
            .where('epoch', '=', '2026-06-18')
            .execute()

        await assert.rejects(
            store.get('at://did:plc:owner/app.creaton.forum.board/paid', '2026-06-19'),
        )
    })

    test('consumes a nonce only once', async () => {
        const store = new IssuerAccessStore(db)
        const now = new Date()
        await store.issueNonce('one-time', 'session', new Date(now.getTime() + 300_000))

        assert.equal(await store.consumeNonce('one-time', 'session', now), true)
        assert.equal(await store.consumeNonce('one-time', 'session', now), false)
    })

    test('requires DID and wallet to match an active entitlement', async () => {
        const store = new IssuerAccessStore(db)
        const wallet = '0x1111111111111111111111111111111111111111'
        await store.createEntitlement({
            boardUri: 'at://did:plc:owner/app.creaton.forum.board/paid',
            did: 'did:plc:member',
            walletAddress: wallet.toUpperCase().replace('0X', '0x'),
            startsAt: new Date('2026-06-18T11:00:00.000Z'),
            expiresAt: new Date('2026-07-18T11:00:00.000Z'),
            source: 'staff',
        })

        const active = await store.findActiveEntitlement(
            'at://did:plc:owner/app.creaton.forum.board/paid',
            'did:plc:member',
            wallet,
            new Date('2026-06-18T12:00:00.000Z'),
        )
        const wrongDid = await store.findActiveEntitlement(
            'at://did:plc:owner/app.creaton.forum.board/paid',
            'did:plc:other',
            wallet,
            new Date('2026-06-18T12:00:00.000Z'),
        )
        assert.equal(active?.wallet_address, wallet)
        assert.equal(wrongDid, undefined)
    })

    test('indexes an Abstract MPP and CREATE committee board policy', async () => {
        const processor = new ForumProcessor(db)
        const boardUri = 'at://did:plc:owner/app.creaton.forum.board/paid'
        await processor.processRecord(boardUri, 'did:plc:owner', 'app.creaton.forum.board', {
            title: 'Paid board',
            access: {
                kind: 'protected',
                issuerDid: 'did:web:issuer.example',
                issuerEndpoint: 'https://issuer.example',
                chainId: 2741,
                asset: '0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1',
                amount: '1000000',
                durationSeconds: 2592000,
                payTo: '0x1111111111111111111111111111111111111111',
                paymentProtocol: 'mpp',
                revenueRouter: '0x2222222222222222222222222222222222222222',
                committeeRegistry: '0x3333333333333333333333333333333333333333',
                entitlementRegistry: '0x4444444444444444444444444444444444444444',
                committeeSize: 15,
                committeeThreshold: 10,
                historyPolicy: 'full',
                epochSeconds: 86400,
            },
        })
        const access = await db
            .selectFrom('forum_board_access')
            .selectAll()
            .where('board_uri', '=', boardUri)
            .executeTakeFirstOrThrow()
        assert.equal(access.payment_protocol, 'mpp')
        assert.equal(access.revenue_router, '0x2222222222222222222222222222222222222222')
        assert.equal(access.committee_size, 15)
        assert.equal(access.committee_threshold, 10)
    })

    test('verifies before settlement and enforces the authenticated AGW payer', async () => {
        const calls: string[] = []
        const requestBodies: unknown[] = []
        const payer = '0x1111111111111111111111111111111111111111'
        const adapter = new AbstractFacilitatorAdapter('https://facilitator.example', async (url, init) => {
            const path = new URL(String(url)).pathname
            calls.push(path)
            requestBodies.push(JSON.parse(String(init?.body)))
            return Response.json(path === '/verify'
                ? { isValid: true, payer }
                : {
                    success: true,
                    payer,
                    network: 'eip155:2741',
                    transaction: `0x${'ab'.repeat(32)}`,
                })
        })
        const result = await adapter.verifyAndSettle({
            paymentPayload: Buffer.from(JSON.stringify({ x402Version: 2 }), 'utf8').toString('base64'),
            expectedPayer: payer,
            paymentRequired: {
                x402Version: 2,
                error: 'Payment required',
                resource: {
                    url: 'https://issuer.example/grant',
                    description: 'Grant',
                    mimeType: 'application/json',
                },
                accepts: [{
                    scheme: 'exact',
                    network: 'eip155:2741',
                    amount: '1000000',
                    asset: '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1',
                    payTo: '0x2222222222222222222222222222222222222222',
                    maxTimeoutSeconds: 60,
                    extra: {},
                }],
            },
        })
        assert.deepEqual(calls, ['/verify', '/settle'])
        assert.ok(requestBodies.every((body) => (body as { x402Version?: number }).x402Version === 2))
        assert.equal(result.payer, payer)
    })

    test('issues an RFC 9180 grant decryptable by the temporary recipient key', async () => {
        const boardUri = 'at://did:plc:owner/app.creaton.forum.board/paid'
        const did = 'did:plc:member'
        const account = '0x1111111111111111111111111111111111111111'
        const accessStore = new IssuerAccessStore(db)
        const epochStore = new EpochKeyStore(db, randomBytes(32))
        await epochStore.getOrCreate(boardUri, '2026-06-17')
        const entitlement = await accessStore.createEntitlement({
            boardUri,
            did,
            walletAddress: account,
            startsAt: new Date('2026-06-01T00:00:00.000Z'),
            expiresAt: new Date('2026-07-01T00:00:00.000Z'),
            source: 'staff',
        })
        const suite = new CipherSuite({
            kem: new DhkemP256HkdfSha256(),
            kdf: new HkdfSha256(),
            aead: new Aes256Gcm(),
        })
        const recipient = await suite.kem.generateKeyPair()
        const publicKey = new Uint8Array(await suite.kem.serializePublicKey(recipient.publicKey))
        const issuer = new ForumGrantIssuer('did:web:issuer.example', accessStore, epochStore)
        const [grant] = await issuer.issue({
            boardUri,
            did,
            entitlement,
            session: {
                account,
                publicKey,
                sessionKeyHash: 'a'.repeat(43),
                certificateHash: 'b'.repeat(43),
                expiresAt: new Date('2026-06-19T00:00:00.000Z'),
            },
            now: new Date('2026-06-18T12:00:00.000Z'),
        })
        assert.ok(grant)
        const context = {
            issuerDid: 'did:web:issuer.example',
            boardUri,
            grantId: grant.grantId,
            sessionKeyHash: grant.sessionKeyHash,
            certificateHash: grant.certificateHash,
            epochFrom: grant.epochFrom,
            epochTo: grant.epochTo,
            expiresAt: grant.expiresAt,
        }
        const plaintext = await suite.open(
            {
                recipientKey: recipient.privateKey,
                enc: Buffer.from(grant.enc, 'base64url'),
                info: new TextEncoder().encode('app.creaton.forum.sarma.v2'),
            },
            Buffer.from(grant.ciphertext, 'base64url'),
            canonicalBytes({ application: 'app.creaton.forum.keyGrant', ...context, version: 2 }),
        )
        const bundle = JSON.parse(new TextDecoder().decode(plaintext)) as {
            version: number
            epochs: Array<{ epoch: string; key: string }>
        }
        assert.equal(bundle.version, 1)
        assert.deepEqual(bundle.epochs.map(({ epoch }) => epoch), ['2026-06-17', '2026-06-18'])
        assert.ok(bundle.epochs.every(({ key }) => Buffer.from(key, 'base64url').byteLength === 32))
    })

    test('publishes opaque grant records and refreshes an expired PDS session', async () => {
        const calls: Array<{ path: string; body?: Record<string, unknown> }> = []
        let createAttempts = 0
        const issuerDid = 'did:plc:issuer'
        const fetchImpl: typeof fetch = async (input, init) => {
            const path = new URL(String(input)).pathname
            const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
            calls.push({ path, body })
            if (path.endsWith('createSession')) {
                return Response.json({ did: issuerDid, accessJwt: 'access-1', refreshJwt: 'refresh-1' })
            }
            if (path.endsWith('refreshSession')) {
                assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer refresh-1')
                return Response.json({ did: issuerDid, accessJwt: 'access-2', refreshJwt: 'refresh-2' })
            }
            createAttempts += 1
            if (createAttempts === 1) return Response.json({}, { status: 401 })
            assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer access-2')
            return Response.json({ uri: `at://${issuerDid}/app.creaton.forum.keyGrant/grant` })
        }
        const publisher = await AtprotoGrantPublisher.login({
            service: 'https://pds.example',
            identifier: 'issuer.example',
            appPassword: 'app-password',
            expectedDid: issuerDid,
            fetchImpl,
        })
        const uri = await publisher.publish(
            { uri: 'at://did:plc:owner/app.creaton.forum.board/paid', cid: 'bafyreboard' },
            {
                grantId: 'opaque-grant',
                boardUri: 'at://did:plc:owner/app.creaton.forum.board/paid',
                sessionKeyHash: Buffer.alloc(32, 1).toString('base64url'),
                certificateHash: Buffer.alloc(32, 2).toString('base64url'),
                epochFrom: '2026-06-18',
                epochTo: '2026-06-18',
                expiresAt: '2026-06-19T00:00:00.000Z',
                version: 2,
                suite: 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM',
                enc: Buffer.alloc(65, 3).toString('base64url'),
                ciphertext: Buffer.alloc(64, 4).toString('base64url'),
                keyCommitment: Buffer.alloc(32, 5).toString('base64url'),
                createdAt: '2026-06-18T12:00:00.000Z',
            },
        )
        assert.equal(uri, `at://${issuerDid}/app.creaton.forum.keyGrant/grant`)
        assert.deepEqual(calls.map(({ path }) => path), [
            '/xrpc/com.atproto.server.createSession',
            '/xrpc/com.atproto.repo.createRecord',
            '/xrpc/com.atproto.server.refreshSession',
            '/xrpc/com.atproto.repo.createRecord',
        ])
        const published = calls.at(-1)?.body?.record
        const serialized = JSON.stringify(published)
        assert.doesNotMatch(serialized, /did:plc:member/)
        assert.doesNotMatch(serialized, /0x1111111111111111111111111111111111111111/)
        assert.match(serialized, /\"\$bytes\"/)
    })

    test('does not consume service auth on 402 and issues after verified settlement', async () => {
        const boardUri = 'at://did:plc:owner/app.creaton.forum.board/paid'
        const did = 'did:plc:member'
        const account = '0x1111111111111111111111111111111111111111'
        const issuerDid = 'did:web:issuer.example'
        const now = new Date().toISOString()
        await db.insertInto('forum_board_access').values({
            board_uri: boardUri,
            issuer_did: issuerDid,
            issuer_endpoint: 'https://issuer.example',
            chain_id: 2741,
            asset: '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1',
            amount: '1000000',
            duration_seconds: 2592000,
            pay_to: '0x2222222222222222222222222222222222222222',
            payment_protocol: 'mpp',
            revenue_router: '0x3333333333333333333333333333333333333333',
            committee_registry: '0x4444444444444444444444444444444444444444',
            entitlement_registry: '0x5555555555555555555555555555555555555555',
            committee_size: 15,
            committee_threshold: 10,
            history_policy: 'full',
            epoch_seconds: 86400,
            indexed_at: now,
        }).execute()
        const accessRow = await db.selectFrom('forum_board_access').selectAll()
            .where('board_uri', '=', boardUri).executeTakeFirstOrThrow()
        const policyHash = Buffer.from(deriveBoardPolicyHash(accessRow).slice(2), 'hex').toString('base64url')
        const capsuleUri = 'at://did:plc:owner/app.creaton.forum.keyCapsule/test'
        const recordUri = 'at://did:plc:owner/app.creaton.forum.topic/test'
        const capsuleCreatedAt = '2026-06-18T12:00:00.000Z'
        const encapsulation = 'test-encapsulation'
        await db.insertInto('forum_protected_record').values({
            uri: recordUri,
            board_uri: boardUri,
            author_did: did,
            kind: 'topic',
            encrypted_body: JSON.stringify({ keyCapsuleUri: capsuleUri }),
            epoch: '2026-06-18',
            indexed_at: now,
        }).execute()
        await db.insertInto('forum_key_capsule').values({
            uri: capsuleUri,
            board_uri: boardUri,
            record_uri: recordUri,
            committee_epoch: 1,
            policy_hash: policyHash,
            encapsulation,
            created_at: capsuleCreatedAt,
            indexed_at: now,
        }).execute()

        let consumed = 0
        let settled = 0
        const accessStore = new IssuerAccessStore(db)
        const serviceAuth = {
            authenticate: async () => ({
                did,
                nonce: 'service:test',
                expiresAt: new Date(Date.now() + 300_000),
            }),
            consume: async () => { consumed += 1 },
        } as unknown as ForumServiceAuth
        const walletAuth = {
            verify: async () => ({
                account,
                publicKey: new Uint8Array(65),
                sessionKeyHash: 'a'.repeat(43),
                certificateHash: 'b'.repeat(43),
                expiresAt: new Date(Date.now() + 86_400_000),
            }),
        } as unknown as ForumWalletAuth
        const settlement = {
            verifyAndSettle: async ({ authorization }: { authorization?: string }) => {
                if (!authorization?.includes('Payment ')) return { id: 'challenge' }
                settled += 1
                return {
                    transaction: `0x${'cd'.repeat(32)}`,
                    paymentRef: `0x${'ef'.repeat(32)}`,
                    payer: account,
                }
            },
            challengeHeader: () => 'Payment id="challenge"',
        } as unknown as AbstractMppSettlementAdapter
        const handler = createKeyReleaseHandler({
            db,
            serviceDid: issuerDid,
            accessStore,
            serviceAuth,
            walletAuth,
            settlement,
            tempoSubscription: {
                verifyAndActivate: async () => {
                    throw new Error('tempo subscription should not run in this test')
                },
                challengeHeader: () => 'Payment id="tempo-challenge"',
            },
            revenueRouter: '0x3333333333333333333333333333333333333333',
            kms: {
                requestRelease: async () => ({
                    receipt: { requestId: 'one' },
                    shares: Array.from({ length: 10 }, (_, index) => ({ shareIndex: index + 1 })),
                }),
            },
        })
        const body = {
            boardUri,
            committeeEpoch: 1,
            eligibilityBlock: '100',
            capsules: [{
                uri: capsuleUri,
                createdAt: capsuleCreatedAt,
                encapsulation,
            }],
            certificate: {
                    version: '1',
                    did,
                    account,
                    boardUri,
                    issuer: issuerDid,
                    publicKey: Buffer.alloc(65).toString('base64url'),
                    sessionKeyHash: 'a'.repeat(43),
                    nonce: `0x${'12'.repeat(32)}`,
                    issuedAt: Date.now(),
                    expiresAt: Date.now() + 86_400_000,
                    signature: '0x1234',
            },
        }
        const challenge = mockResponse()
        await handler(mockRequest(body), challenge.response)
        assert.equal(challenge.statusCode, 402)
        assert.ok(challenge.headers.get('www-authenticate'))
        assert.equal(consumed, 0)

        const paid = mockResponse()
        await handler(
            mockRequest(body, 'credential'),
            paid.response,
        )
        assert.equal(paid.statusCode, 200)
        assert.equal((paid.body as { shares: unknown[] }).shares.length, 10)
        assert.ok(paid.headers.get('payment-receipt'))
        assert.equal(settled, 1)
        assert.equal(consumed, 1)
        assert.ok(await accessStore.findActiveEntitlement(boardUri, did, account))
    })
})

function mockRequest(body: unknown, paymentSignature?: string) {
    return {
        body,
        get(name: string) {
            if (name.toLowerCase() === 'authorization') {
                return paymentSignature ? `Bearer test, Payment ${paymentSignature}` : 'Bearer test'
            }
            return undefined
        },
    } as unknown as import('express').Request
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

function mockResponse() {
    const state: {
        statusCode: number
        headers: Map<string, string>
        body: unknown
        response: import('express').Response
    } = {
        statusCode: 200,
        headers: new Map(),
        body: undefined,
        response: undefined as unknown as import('express').Response,
    }
    const response = {
        status(code: number) {
            state.statusCode = code
            return response
        },
        set(name: string, value: string) {
            state.headers.set(name.toLowerCase(), value)
            return response
        },
        json(value: unknown) {
            state.body = value
            return response
        },
    } as unknown as import('express').Response
    state.response = response
    return state
}
