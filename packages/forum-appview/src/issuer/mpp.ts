import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
    createPublicClient,
    createWalletClient,
    encodePacked,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
} from 'viem'
import { abstract, abstractTestnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import type { ForumBoardAccessTable } from '../db/schema'

const ROUTER_ABI = parseAbi([
    'function allocate(bytes32 paymentRef,bytes32 boardId,uint256 amount)',
    'function settleWithAuthorization(bytes32 paymentRef,bytes32 boardId,uint256 amount,address payer,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)',
    'function settleWithAuthorizationAndGrant(bytes32 paymentRef,bytes32 boardId,uint256 amount,address payer,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature,address entitlementRegistry,bytes32 subjectHash,uint64 entitlementFrom,uint64 entitlementUntil,uint8 archiveMode,bytes32 policyHash)',
])
const ERC3009_METADATA_ABI = parseAbi([
    'function name() view returns (string)',
    'function version() view returns (string)',
    'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
])
const TYPES = {
    TransferWithAuthorization: [
        { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ],
} as const

export interface MppSettlementResult {
    transaction: Hex
    payer: Address
    paymentRef: Hex
    subjectHash: Hex
    policyHash: Hex
}

type ChargeRequest = {
    amount: string
    currency: Address
    recipient: Address
    methodDetails: { chainId: number }
    description: string
}

type Challenge = {
    id: string
    realm: string
    method: 'abstract'
    intent: 'charge'
    request: ChargeRequest
    expires: string
    opaque: { boardUri: string }
    digest: string
}

export class AbstractMppSettlementAdapter {
    private readonly account

    constructor(
        private readonly secret: string,
        private readonly privateKey: Hex,
        private readonly rpcUrl: string,
    ) {
        if (Buffer.byteLength(secret) < 32) throw new Error('FORUM_MPP_SECRET must be at least 32 bytes')
        this.account = privateKeyToAccount(privateKey)
    }

    createChallenge(access: ForumBoardAccessTable, resourceUrl: string, revenueRouter: Address): Challenge {
        assertSupported(access, revenueRouter)
        const unsigned = {
            id: randomUUID(), realm: new URL(resourceUrl).origin, method: 'abstract' as const,
            intent: 'charge' as const,
            request: {
                amount: access.amount, currency: access.asset as Address, recipient: revenueRouter,
                methodDetails: { chainId: access.chain_id }, description: `Access to ${access.board_uri}`,
            },
            expires: new Date(Date.now() + 5 * 60_000).toISOString(),
            opaque: { boardUri: access.board_uri },
        }
        return { ...unsigned, digest: this.digest(unsigned) }
    }

    challengeHeader(challenge: Challenge): string {
        const request = Buffer.from(canonicalJson(challenge.request)).toString('base64url')
        const opaque = Buffer.from(canonicalJson(challenge.opaque)).toString('base64url')
        return `Payment id="${challenge.id}", realm="${challenge.realm}", method="abstract", intent="charge", request="${request}", expires="${challenge.expires}", digest="${challenge.digest}", opaque="${opaque}"`
    }

    async verifyAndSettle(input: {
        authorization: string | undefined
        access: ForumBoardAccessTable
        expectedPayer: Address
        subjectDid: string
        resourceUrl: string
        revenueRouter: Address
        entitlementRegistry: Address
    }): Promise<MppSettlementResult | Challenge> {
        const encoded = extractPaymentCredential(input.authorization)
        if (!encoded) return this.createChallenge(input.access, input.resourceUrl, input.revenueRouter)
        const wire = decodeCredential(encoded)
        const challenge = decodeChallenge(wire.challenge)
        const expected = this.createComparableChallenge(input.access, input.resourceUrl, input.revenueRouter, challenge)
        this.verifyChallenge(challenge, expected)

        const payload = wire.payload
        const from = expectAddress(payload.from, 'MPP payer')
        if (from.toLowerCase() !== input.expectedPayer.toLowerCase()) throw new Error('MPP payer mismatch')
        const nonce = expectHex32(payload.nonce, 'MPP nonce')
        const signature = expectHex(payload.signature, 'MPP signature')
        const validAfter = expectInteger(payload.validAfter, 'MPP validAfter')
        const validBefore = expectInteger(payload.validBefore, 'MPP validBefore')
        const now = BigInt(Math.floor(Date.now() / 1_000))
        if (validAfter > now || validBefore <= now) throw new Error('MPP authorization is outside its validity window')

        const chain = input.access.chain_id === abstract.id ? abstract : abstractTestnet
        const publicClient = createPublicClient({ chain, transport: http(this.rpcUrl) })
        if (payload.type !== 'authorization') throw new Error('Unsupported MPP credential type')
        const [name, version, authorizationUsed] = await Promise.all([
            publicClient.readContract({ address: input.access.asset as Address, abi: ERC3009_METADATA_ABI, functionName: 'name' }),
            publicClient.readContract({ address: input.access.asset as Address, abi: ERC3009_METADATA_ABI, functionName: 'version' }),
            publicClient.readContract({ address: input.access.asset as Address, abi: ERC3009_METADATA_ABI,
                functionName: 'authorizationState', args: [from, nonce] }),
        ])
        if (authorizationUsed) throw new Error('MPP authorization nonce already used')
        const verified = await publicClient.verifyTypedData({
            address: from,
            domain: {
                name, version, chainId: input.access.chain_id,
                verifyingContract: input.access.asset as Address,
            },
            types: TYPES, primaryType: 'TransferWithAuthorization',
            message: {
                from, to: input.revenueRouter, value: BigInt(input.access.amount),
                validAfter, validBefore, nonce,
            },
            signature,
        })
        if (!verified) throw new Error('Invalid Abstract MPP ERC-3009 authorization')

        const wallet = createWalletClient({ account: this.account, chain, transport: http(this.rpcUrl) })
        const paymentRef = keccak256(stringToHex(challenge.id))
        const { subjectHash, policyHash } = deriveAccessPolicyBinding(input.access, input.subjectDid, from)
        const entitlementFrom = BigInt(Math.floor(Date.now() / 1_000))
        const entitlementUntil = entitlementFrom + BigInt(input.access.duration_seconds)
        const archiveMode = ({ full: 0, window: 1, forward: 2 } as const)[input.access.history_policy]
        const transaction = await wallet.writeContract({
            address: input.revenueRouter, abi: ROUTER_ABI, functionName: 'settleWithAuthorizationAndGrant',
            args: [
                paymentRef, keccak256(stringToHex(input.access.board_uri)), BigInt(input.access.amount),
                from, validAfter, validBefore, nonce, signature,
                input.entitlementRegistry, subjectHash, entitlementFrom, entitlementUntil, archiveMode, policyHash,
            ],
        })
        await publicClient.waitForTransactionReceipt({ hash: transaction })
        return { transaction, payer: from, paymentRef, subjectHash, policyHash }
    }

    private createComparableChallenge(access: ForumBoardAccessTable, resourceUrl: string, router: Address, supplied: Challenge) {
        assertSupported(access, router)
        return {
            id: supplied.id, realm: new URL(resourceUrl).origin, method: 'abstract' as const,
            intent: 'charge' as const,
            request: { amount: access.amount, currency: access.asset as Address, recipient: router,
                methodDetails: { chainId: access.chain_id }, description: `Access to ${access.board_uri}` },
            expires: supplied.expires, opaque: { boardUri: access.board_uri },
        }
    }

    private verifyChallenge(challenge: Challenge, expected: Omit<Challenge, 'digest'>) {
        if (new Date(challenge.expires).getTime() <= Date.now()) throw new Error('MPP challenge expired')
        const actual = Buffer.from(challenge.digest, 'base64url')
        const wanted = Buffer.from(this.digest(expected), 'base64url')
        if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw new Error('Invalid MPP challenge digest')
        if (canonicalJson({ ...challenge, digest: undefined }) !== canonicalJson({ ...expected, digest: undefined })) {
            throw new Error('MPP challenge was modified')
        }
    }

    private digest(value: unknown): string {
        return createHmac('sha256', this.secret).update(canonicalJson(value)).digest('base64url')
    }
}

export function deriveAccessPolicyBinding(access: ForumBoardAccessTable, did: string, payer: Address) {
    const boardId = keccak256(stringToHex(access.board_uri))
    const subjectHash = keccak256(encodePacked(['string', 'address'], [did, payer]))
    return { boardId, subjectHash, policyHash: deriveBoardPolicyHash(access) }
}

export function deriveBoardPolicyHash(access: ForumBoardAccessTable) {
    return keccak256(stringToHex(canonicalJson({
        boardUri: access.board_uri,
        chainId: access.chain_id,
        asset: access.asset.toLowerCase(),
        amount: access.amount,
        durationSeconds: access.duration_seconds,
        historyPolicy: access.history_policy,
        revenueRouter: access.revenue_router?.toLowerCase(),
        committeeRegistry: access.committee_registry?.toLowerCase(),
        entitlementRegistry: access.entitlement_registry?.toLowerCase(),
        committeeSize: access.committee_size,
        committeeThreshold: access.committee_threshold,
    })))
}

export function paymentReceiptHeader(result: MppSettlementResult): string {
    return Buffer.from(JSON.stringify({
        method: 'abstract', intent: 'charge', reference: result.paymentRef,
        transaction: result.transaction,
    })).toString('base64url')
}

function extractPaymentCredential(header: string | undefined): string | undefined {
    return /(?:^|,)\s*Payment\s+([A-Za-z0-9_-]+)(?:\s*,|$)/i.exec(header ?? '')?.[1]
}

function decodeCredential(encoded: string): { challenge: Record<string, unknown>; payload: Record<string, unknown> } {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Record<string, unknown>
    if (!value.challenge || typeof value.challenge !== 'object' || !value.payload || typeof value.payload !== 'object') {
        throw new Error('Malformed MPP credential')
    }
    return { challenge: value.challenge as Record<string, unknown>, payload: value.payload as Record<string, unknown> }
}

function decodeChallenge(value: Record<string, unknown>): Challenge {
    const request = JSON.parse(Buffer.from(String(value.request), 'base64url').toString())
    const opaque = typeof value.opaque === 'string'
        ? JSON.parse(Buffer.from(value.opaque, 'base64url').toString()) : value.opaque
    return { ...value, request, opaque } as Challenge
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

function assertSupported(access: ForumBoardAccessTable, router: Address) {
    if (access.chain_id !== abstract.id && access.chain_id !== abstractTestnet.id) throw new Error('Unsupported Abstract chain')
    expectAddress(access.asset, 'payment asset'); expectAddress(access.pay_to, 'forum recipient'); expectAddress(router, 'revenue router')
    if (!/^\d+$/.test(access.amount) || BigInt(access.amount) <= 0n) throw new Error('Invalid MPP amount')
}
function expectAddress(value: unknown, name: string): Address {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid ${name}`)
    return value as Address
}
function expectHex32(value: unknown, name: string): Hex {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${name}`)
    return value as Hex
}
function expectHex(value: unknown, name: string): Hex {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`Invalid ${name}`)
    return value as Hex
}
function expectInteger(value: unknown, name: string): bigint {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) throw new Error(`Invalid ${name}`)
    return BigInt(value)
}
