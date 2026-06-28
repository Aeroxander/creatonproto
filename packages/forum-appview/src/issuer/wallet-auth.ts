import { createHash } from 'node:crypto'
import { DidResolver } from '@atproto/identity'
import {
    createPublicClient,
    hashTypedData,
    http,
    type Address,
    type Hex,
} from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { tempoMainnet, tempoTestnet, TEMPO_MAINNET_CHAIN_ID, TEMPO_TESTNET_CHAIN_ID } from './tempo'

const ADDRESS_CONTROL_COLLECTION = 'com.creaton.evm.addressControl'
const SESSION_VERSION = '1'
const SESSION_TTL_SECONDS = 24 * 60 * 60
const SUPPORTED_LINK_CHAIN_IDS = [
    TEMPO_MAINNET_CHAIN_ID,
    TEMPO_TESTNET_CHAIN_ID,
] as const

const SESSION_TYPES = {
    ForumAccessSession: [
        { name: 'did', type: 'string' },
        { name: 'account', type: 'address' },
        { name: 'boardUri', type: 'string' },
        { name: 'issuer', type: 'string' },
        { name: 'sessionKey', type: 'bytes' },
        { name: 'sessionKeyHash', type: 'string' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'issuedAt', type: 'uint64' },
        { name: 'expiresAt', type: 'uint64' },
    ],
} as const

export interface ForumSessionCertificate {
    version: '1'
    did: string
    account: Address
    boardUri: string
    issuer: string
    publicKey: string
    sessionKeyHash: string
    nonce: Hex
    issuedAt: number
    expiresAt: number
    signature: Hex
}

export interface VerifiedSession {
    account: Address
    publicKey: Uint8Array
    sessionKeyHash: string
    certificateHash: string
    expiresAt: Date
}

type AddressControlRecord = {
    address?: { $bytes?: unknown }
    signature?: { $bytes?: unknown }
    alsoOn?: unknown
    siwe?: {
        domain?: unknown
        address?: unknown
        statement?: unknown
        uri?: unknown
        version?: unknown
        chainId?: unknown
        nonce?: unknown
        issuedAt?: unknown
    }
}

export class ForumWalletAuth {
    private readonly resolver: DidResolver
    private readonly tempoRpcUrl

    constructor(
        private readonly serviceDid: string,
        plcUrl = 'https://plc.directory',
        tempoRpcUrl = 'https://rpc.tempo.xyz',
    ) {
        this.resolver = new DidResolver({ plcUrl, timeout: 5_000 })
        this.tempoRpcUrl = tempoRpcUrl
    }

    private clientForChain(chainId: number) {
        if (chainId !== TEMPO_MAINNET_CHAIN_ID && chainId !== TEMPO_TESTNET_CHAIN_ID) {
            throw new Error(`Unsupported Tempo chain ID: ${chainId}`)
        }
        return createPublicClient({
            chain: chainId === TEMPO_TESTNET_CHAIN_ID ? tempoTestnet : tempoMainnet,
            transport: http(this.tempoRpcUrl),
        })
    }

    async verify(
        did: string,
        certificate: ForumSessionCertificate,
        options?: { chainId?: number },
    ): Promise<VerifiedSession> {
        validateCertificate(did, this.serviceDid, certificate)
        await this.verifyDidWalletLink(did, certificate.account)

        const chainId = options?.chainId ?? TEMPO_MAINNET_CHAIN_ID
        const typedData = sessionTypedData(certificate, chainId)
        const signatureValid = await this.clientForChain(chainId).verifyTypedData({
            address: certificate.account,
            ...typedData,
            signature: certificate.signature,
        })
        if (!signatureValid) throw new Error('Invalid Tempo forum-session signature')

        return {
            account: certificate.account.toLowerCase() as Address,
            publicKey: decodeBase64Url(certificate.publicKey),
            sessionKeyHash: certificate.sessionKeyHash,
            certificateHash: Buffer.from(hashTypedData(typedData).slice(2), 'hex').toString('base64url'),
            expiresAt: new Date(certificate.expiresAt),
        }
    }

    private async verifyDidWalletLink(did: string, account: Address): Promise<void> {
        const { pds } = await this.resolver.resolveAtprotoData(did)
        const url = new URL('/xrpc/com.atproto.repo.listRecords', pds)
        url.searchParams.set('repo', did)
        url.searchParams.set('collection', ADDRESS_CONTROL_COLLECTION)
        url.searchParams.set('limit', '100')
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`Could not read DID wallet links: HTTP ${response.status}`)
        const body = await response.json() as { records?: Array<{ value?: unknown }> }
        for (const entry of body.records ?? []) {
            if (await this.isValidWalletLink(did, account, entry.value)) return
        }
        throw new Error('The authenticated DID is not linked to a supported Tempo wallet')
    }

    private async isValidWalletLink(did: string, account: Address, value: unknown): Promise<boolean> {
        if (!value || typeof value !== 'object') return false
        const record = value as AddressControlRecord
        const siwe = record.siwe
        if (
            !siwe || typeof siwe.domain !== 'string' || typeof siwe.address !== 'string' ||
            typeof siwe.statement !== 'string' || typeof siwe.uri !== 'string' ||
            siwe.version !== '1' || typeof siwe.chainId !== 'number' ||
            typeof siwe.nonce !== 'string' || typeof siwe.issuedAt !== 'string' ||
            typeof record.address?.$bytes !== 'string' || typeof record.signature?.$bytes !== 'string' ||
            !Array.isArray(record.alsoOn ?? [])
        ) return false

        const normalized = account.toLowerCase()
        const recordAddress = `0x${Buffer.from(record.address.$bytes, 'base64').toString('hex')}`
        const alsoOn = record.alsoOn as unknown[]
        const linkedChainIds = [siwe.chainId, ...alsoOn.filter((id): id is number => typeof id === 'number')]
        if (
            siwe.address.toLowerCase() !== normalized || recordAddress.toLowerCase() !== normalized ||
            !linkedChainIds.some((id) => (SUPPORTED_LINK_CHAIN_IDS as readonly number[]).includes(id)) ||
            siwe.statement !== `Prove control of ${siwe.address} to link it to ${did}`
        ) return false

        const message = createSiweMessage({
            domain: siwe.domain,
            address: siwe.address as Address,
            statement: siwe.statement,
            uri: siwe.uri,
            version: '1',
            chainId: siwe.chainId,
            nonce: siwe.nonce,
            issuedAt: new Date(siwe.issuedAt),
        })
        return this.clientForChain(siwe.chainId).verifySiweMessage({
            address: account,
            message,
            signature: `0x${Buffer.from(record.signature.$bytes, 'base64').toString('hex')}` as Hex,
            domain: siwe.domain,
            nonce: siwe.nonce,
        }).catch(() => false)
    }
}

function validateCertificate(did: string, serviceDid: string, certificate: ForumSessionCertificate): void {
    const now = Date.now()
    const publicKey = decodeBase64Url(certificate.publicKey)
    const fingerprint = createHash('sha256').update(publicKey).digest('base64url')
    if (
        certificate.version !== SESSION_VERSION || certificate.did !== did ||
        certificate.issuer !== serviceDid || !/^0x[0-9a-fA-F]{40}$/.test(certificate.account) ||
        !certificate.boardUri.startsWith('at://') || !/^0x[0-9a-fA-F]{64}$/.test(certificate.nonce) ||
        !/^0x[0-9a-fA-F]+$/.test(certificate.signature) || publicKey.byteLength !== 65 ||
        publicKey[0] !== 4 || fingerprint !== certificate.sessionKeyHash ||
        !Number.isSafeInteger(certificate.issuedAt) || !Number.isSafeInteger(certificate.expiresAt) ||
        certificate.issuedAt > now + 30_000 || certificate.expiresAt <= now ||
        certificate.expiresAt > certificate.issuedAt + SESSION_TTL_SECONDS * 1_000
    ) throw new Error('Invalid forum-session certificate')
}

function sessionTypedData(certificate: ForumSessionCertificate, chainId = TEMPO_MAINNET_CHAIN_ID) {
    return {
        domain: { name: 'Creaton Forum Access', version: SESSION_VERSION, chainId },
        types: SESSION_TYPES,
        primaryType: 'ForumAccessSession' as const,
        message: {
            did: certificate.did,
            account: certificate.account,
            boardUri: certificate.boardUri,
            issuer: certificate.issuer,
            sessionKey: `0x${Buffer.from(decodeBase64Url(certificate.publicKey)).toString('hex')}` as Hex,
            sessionKeyHash: certificate.sessionKeyHash,
            nonce: certificate.nonce,
            issuedAt: BigInt(Math.floor(certificate.issuedAt / 1_000)),
            expiresAt: BigInt(Math.floor(certificate.expiresAt / 1_000)),
        },
    }
}

function decodeBase64Url(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value')
    return Buffer.from(value, 'base64url')
}
