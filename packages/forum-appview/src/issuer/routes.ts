import { createHash } from 'node:crypto'
import express, { type Request, type Response } from 'express'
import { type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '../db/schema'
import { IssuerAccessStore } from './access-store'
import { ForumKmsClient } from './kms-client'
import { deriveAccessPolicyBinding, deriveBoardPolicyHash } from './mppPolicy'
import {
    TempoMppSubscriptionAdapter,
    tempoSubscriptionReceiptHeader,
} from './tempo'
import type { MppSettlementResult } from './mppPolicy'
import { ForumServiceAuth } from './service-auth'
import { ForumWalletAuth, type ForumSessionCertificate } from './wallet-auth'

export const REQUEST_KEY_RELEASE_NSID = 'app.creaton.forum.requestKeyRelease'
export const CONFIRM_BOARD_PAYMENT_NSID = 'app.creaton.forum.confirmBoardPayment'

const sessionCertificateSchema = z.object({
    version: z.literal('1'), did: z.string().startsWith('did:').max(2048),
    account: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    boardUri: z.string().startsWith('at://').max(2048),
    issuer: z.string().startsWith('did:').max(2048),
    publicKey: z.string().regex(/^[A-Za-z0-9_-]+$/).max(256),
    sessionKeyHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    issuedAt: z.number().int().safe().positive(), expiresAt: z.number().int().safe().positive(),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(16384),
})

const requestSchema = z.object({
    boardUri: z.string().startsWith('at://').max(2048),
    capsules: z.array(z.object({
        uri: z.string().startsWith('at://').max(2048),
        createdAt: z.string().datetime(),
        encapsulation: z.string().regex(/^[A-Za-z0-9_-]+$/).max(128),
    })).min(1).max(100),
    committeeEpoch: z.number().int().positive(),
    eligibilityBlock: z.string().regex(/^\d+$/).max(78),
    certificate: sessionCertificateSchema,
})

const confirmBoardPaymentSchema = z.object({
    boardUri: z.string().startsWith('at://').max(2048),
    certificate: sessionCertificateSchema,
})

export interface IssuerRouterOptions {
    db: Kysely<Database>
    serviceDid: string
    serviceAuth: ForumServiceAuth
    walletAuth: ForumWalletAuth
    accessStore: IssuerAccessStore
    tempoSubscription: TempoMppSubscriptionAdapter
    kms: ForumKmsClient
}

function isProtectedBoardPolicy(access: {
    payment_protocol: string | null
    committee_size: number | null
    committee_threshold: number | null
    committee_registry: string | null
    entitlement_registry: string | null
}): access is {
    payment_protocol: 'tempo'
    committee_size: number
    committee_threshold: number
    committee_registry: string
    entitlement_registry: string
} {
    return (
        access.payment_protocol === 'tempo' &&
        access.committee_size === 15 &&
        access.committee_threshold === 10 &&
        !!access.committee_registry &&
        !!access.entitlement_registry
    )
}

export function createIssuerRouter(options: IssuerRouterOptions): express.Router {
    const router = express.Router()
    router.post(`/xrpc/${REQUEST_KEY_RELEASE_NSID}`, createKeyReleaseHandler(options))
    router.post(`/xrpc/${CONFIRM_BOARD_PAYMENT_NSID}`, createConfirmBoardPaymentHandler(options))
    router.get('/xrpc/app.creaton.forum.getEncryptionParameters', async (req, res) => {
        const boardUri = String(req.query.boardUri ?? '')
        if (!boardUri.startsWith('at://')) return res.status(400).json({ error: 'InvalidBoardUri' })
        const access = await options.db.selectFrom('forum_board_access').selectAll()
            .where('board_uri', '=', boardUri).executeTakeFirst()
        if (!access) return res.status(404).json({ error: 'ProtectedBoardNotFound' })
        try {
            const parameters = await options.kms.getEncryptionParameters()
            return res.json({ ...parameters, policyHash: deriveBoardPolicyHash(access) })
        } catch (error) {
            console.error('Encryption parameter discovery failed:', error)
            return res.status(503).json({ error: 'CommitteeUnavailable' })
        }
    })
    return router
}

async function grantEntitlementFromSettlement(input: {
    accessStore: IssuerAccessStore
    access: { board_uri: string; amount: string; asset: string; chain_id: number; duration_seconds: number; pay_to: string }
    boardUri: string
    did: string
    walletAddress: string
    settlement: MppSettlementResult
}) {
    const receiptId = input.settlement.paymentRef.slice(2)
    let receipt = await input.accessStore.getReceipt(receiptId)
    if (!receipt) {
        receipt = await input.accessStore.createReceipt({
            id: receiptId,
            boardUri: input.boardUri,
            did: input.did,
            walletAddress: input.walletAddress,
            network: `eip155:${input.access.chain_id}`,
            txHash: input.settlement.transaction,
            amount: input.access.amount,
            asset: input.access.asset,
            payTo: input.access.pay_to,
            status: 'settled',
        })
    }
    let entitlement = await input.accessStore.findEntitlementByPaymentRef(receiptId)
    if (!entitlement) {
        const startsAt = new Date()
        entitlement = await input.accessStore.createEntitlement({
            boardUri: input.boardUri,
            did: input.did,
            walletAddress: input.walletAddress,
            startsAt,
            expiresAt: new Date(startsAt.getTime() + input.access.duration_seconds * 1_000),
            source: 'tempo',
            paymentRef: receiptId,
        })
    }
    return entitlement
}

export function createKeyReleaseHandler(options: IssuerRouterOptions) {
    return async (req: Request, res: Response) => {
        try {
            const auth = await options.serviceAuth.authenticate(req.get('authorization'), REQUEST_KEY_RELEASE_NSID)
            const parsed = requestSchema.safeParse(req.body)
            if (!parsed.success) return res.status(400).json({ error: 'InvalidRequest', message: parsed.error.message })
            const input = parsed.data
            if (input.certificate.did !== auth.did || input.certificate.boardUri !== input.boardUri) {
                return res.status(403).json({ error: 'IdentityMismatch' })
            }
            const access = await options.db.selectFrom('forum_board_access').selectAll()
                .where('board_uri', '=', input.boardUri).executeTakeFirst()
            if (!access) return res.status(404).json({ error: 'ProtectedBoardNotFound' })
            if (access.issuer_did !== options.serviceDid || input.certificate.issuer !== options.serviceDid) {
                return res.status(403).json({ error: 'WrongIssuer' })
            }
            if (!isProtectedBoardPolicy(access)) {
                return res.status(409).json({ error: 'PolicyMismatch' })
            }

            const policyHash = deriveBoardPolicyHash(access)
            const policyHashBytes = Buffer.from(policyHash.slice(2), 'hex').toString('base64url')
            const capsules = await Promise.all(input.capsules.map(async requested => {
                const capsule = await options.db.selectFrom('forum_key_capsule').selectAll()
                    .where('uri', '=', requested.uri).executeTakeFirst()
                if (!capsule || capsule.board_uri !== input.boardUri ||
                    capsule.committee_epoch !== input.committeeEpoch ||
                    capsule.policy_hash !== policyHashBytes ||
                    capsule.created_at !== requested.createdAt ||
                    capsule.encapsulation !== requested.encapsulation) {
                    throw new Error('KMS capsule is not an indexed protected forum record')
                }
                const protectedRecord = await options.db.selectFrom('forum_protected_record')
                    .select(['uri', 'board_uri', 'encrypted_body'])
                    .where('uri', '=', capsule.record_uri).executeTakeFirst()
                const encryptedBody = protectedRecord
                    ? JSON.parse(protectedRecord.encrypted_body) as { keyCapsuleUri?: unknown }
                    : null
                if (!protectedRecord || protectedRecord.board_uri !== input.boardUri ||
                    encryptedBody?.keyCapsuleUri !== capsule.uri) {
                    throw new Error('KMS capsule is not bound to its protected post')
                }
                return {
                    uri: capsule.uri,
                    createdAt: capsule.created_at,
                    encapsulation: capsule.encapsulation,
                }
            }))

            const session = await options.walletAuth.verify(
                auth.did,
                input.certificate as ForumSessionCertificate,
                { chainId: access.chain_id ?? undefined },
            )
            const entitlement = await options.accessStore.findActiveEntitlement(input.boardUri, auth.did, session.account)
            if (!entitlement) {
                return res.status(402).json({
                    error: 'EntitlementRequired',
                    message: 'Subscribe to this board before unlocking encrypted posts.',
                })
            }

            const certificateHash = createHash('sha256').update(JSON.stringify(input.certificate)).digest('hex')
            const binding = deriveAccessPolicyBinding(access, auth.did, session.account)
            const release = await options.kms.requestRelease({
                boardUri: input.boardUri, boardId: binding.boardId, capsules,
                committeeEpoch: input.committeeEpoch, eligibilityBlock: input.eligibilityBlock,
                did: auth.did, walletAddress: session.account, sessionKeyHash: session.sessionKeyHash,
                subjectHash: binding.subjectHash, policyHash: binding.policyHash,
                recipientPublicKey: session.publicKey, certificateHash,
                entitlement: { validFrom: entitlement.starts_at, validUntil: entitlement.expires_at,
                    paymentRef: entitlement.payment_ref, historyPolicy: access.history_policy,
                    durationSeconds: access.duration_seconds },
                contracts: { committeeRegistry: access.committee_registry,
                    entitlementRegistry: access.entitlement_registry },
            })
            await options.serviceAuth.consume(auth)
            return res.json(release)
        } catch (error) {
            console.error('Key-release request failed:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            if (/service-auth|JWT|bearer token/i.test(message)) return res.status(401).json({ error: 'AuthenticationRequired' })
            if (/MPP|payment|authorization/i.test(message)) return res.status(402).json({ error: 'PaymentFailed' })
            if (/wallet|certificate|signature|DID/i.test(message)) return res.status(403).json({ error: 'InvalidAccessCertificate' })
            if (/KMS|threshold/i.test(message)) return res.status(503).json({ error: 'CommitteeUnavailable' })
            return res.status(500).json({ error: 'InternalError' })
        }
    }
}

export function createConfirmBoardPaymentHandler(options: IssuerRouterOptions) {
    return async (req: Request, res: Response) => {
        try {
            const auth = await options.serviceAuth.authenticate(
                req.get('authorization'),
                CONFIRM_BOARD_PAYMENT_NSID,
            )
            const parsed = confirmBoardPaymentSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: 'InvalidRequest', message: parsed.error.message })
            }
            const input = parsed.data
            if (input.certificate.did !== auth.did || input.certificate.boardUri !== input.boardUri) {
                return res.status(403).json({ error: 'IdentityMismatch' })
            }
            const access = await options.db.selectFrom('forum_board_access').selectAll()
                .where('board_uri', '=', input.boardUri).executeTakeFirst()
            if (!access) return res.status(404).json({ error: 'ProtectedBoardNotFound' })
            if (access.issuer_did !== options.serviceDid || input.certificate.issuer !== options.serviceDid) {
                return res.status(403).json({ error: 'WrongIssuer' })
            }
            if (!isProtectedBoardPolicy(access)) {
                return res.status(409).json({ error: 'PolicyMismatch' })
            }

            const session = await options.walletAuth.verify(
                auth.did,
                input.certificate as ForumSessionCertificate,
                { chainId: access.chain_id ?? undefined },
            )
            const existing = await options.accessStore.findActiveEntitlement(
                input.boardUri,
                auth.did,
                session.account,
            )
            if (existing) {
                return res.json({
                    entitlement: {
                        validFrom: existing.starts_at,
                        validUntil: existing.expires_at,
                        paymentRef: existing.payment_ref,
                    },
                })
            }

            const resourceUrl = new URL(`/xrpc/${CONFIRM_BOARD_PAYMENT_NSID}`, access.issuer_endpoint).toString()
            const paymentHeader = req.get('authorization')
            const result = await options.tempoSubscription.verifyAndActivate({
                authorization: paymentHeader,
                access,
                expectedPayer: session.account,
                subjectDid: auth.did,
                resourceUrl,
                entitlementRegistry: access.entitlement_registry,
            })
            if (!('transaction' in result)) {
                return res.status(402).set('WWW-Authenticate', options.tempoSubscription.challengeHeader(result))
                    .json({ error: 'SubscriptionRequired' })
            }

            const entitlement = await grantEntitlementFromSettlement({
                accessStore: options.accessStore,
                access,
                boardUri: input.boardUri,
                did: auth.did,
                walletAddress: session.account,
                settlement: result,
            })
            await options.accessStore.upsertBillingProfile({
                did: auth.did,
                walletAddress: session.account,
                autoRenewEnabled: true,
            })
            await options.serviceAuth.consume(auth)
            res.set('Payment-Receipt', tempoSubscriptionReceiptHeader(result))
            return res.json({
                entitlement: {
                    validFrom: entitlement.starts_at,
                    validUntil: entitlement.expires_at,
                    paymentRef: entitlement.payment_ref,
                },
            })
        } catch (error) {
            console.error('Board subscription activation failed:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            if (/service-auth|JWT|bearer token/i.test(message)) {
                return res.status(401).json({ error: 'AuthenticationRequired' })
            }
            if (/MPP|payment|authorization/i.test(message)) {
                return res.status(402).json({ error: 'PaymentFailed', message })
            }
            if (/wallet|certificate|signature|DID/i.test(message)) {
                return res.status(403).json({ error: 'InvalidAccessCertificate' })
            }
            return res.status(500).json({ error: 'InternalError', message })
        }
    }
}
