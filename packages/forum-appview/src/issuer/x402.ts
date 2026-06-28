import type { ForumBoardAccessTable } from '../db/schema'

export const ABSTRACT_MAINNET = 'eip155:2741'
export const ABSTRACT_USDC = '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1'
const ABSTRACT_USDC_EIP712_NAME = 'Bridged USDC (Stargate)'
const ABSTRACT_USDC_EIP712_VERSION = '2'

export interface X402PaymentRequired {
    x402Version: 2
    error: string
    resource: {
        url: string
        description: string
        mimeType: 'application/json'
    }
    accepts: Array<{
        scheme: 'exact'
        network: typeof ABSTRACT_MAINNET
        amount: string
        asset: string
        payTo: string
        maxTimeoutSeconds: number
        extra: Record<string, unknown>
    }>
}

export interface SettlementRequest {
    paymentPayload: string
    paymentRequired: X402PaymentRequired
    expectedPayer: string
}

export interface SettlementResult {
    success: true
    transaction: string
    network: typeof ABSTRACT_MAINNET
    payer: string
}

/**
 * Boundary around the Abstract facilitator. Production code must verify and
 * settle through the facilitator before creating an entitlement.
 */
export interface X402SettlementAdapter {
    verifyAndSettle(request: SettlementRequest): Promise<SettlementResult>
}

export class SettlementUnavailableError extends Error {
    constructor() {
        super('Abstract x402 settlement is not configured')
        this.name = 'SettlementUnavailableError'
    }
}

export class DisabledX402SettlementAdapter implements X402SettlementAdapter {
    async verifyAndSettle(_request: SettlementRequest): Promise<SettlementResult> {
        throw new SettlementUnavailableError()
    }
}

type FacilitatorVerifyResponse = {
    isValid?: unknown
    invalidReason?: unknown
    payer?: unknown
}

type FacilitatorSettleResponse = {
    success?: unknown
    errorReason?: unknown
    transaction?: unknown
    network?: unknown
    payer?: unknown
}

export class AbstractFacilitatorAdapter implements X402SettlementAdapter {
    constructor(
        private readonly facilitatorUrl = 'https://facilitator.x402.abs.xyz',
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async verifyAndSettle(request: SettlementRequest): Promise<SettlementResult> {
        const paymentPayload = decodePaymentPayload(request.paymentPayload)
        const paymentRequirements = request.paymentRequired.accepts[0]
        if (!paymentRequirements) throw new Error('No accepted payment requirement')
        const body = { x402Version: 2, paymentPayload, paymentRequirements }

        const verification = await this.post<FacilitatorVerifyResponse>('/verify', body)
        if (verification.isValid !== true) {
            const reason = typeof verification.invalidReason === 'string'
                ? verification.invalidReason
                : 'facilitator rejected payment'
            throw new Error(`Abstract x402 verification failed: ${reason}`)
        }
        assertPayer(verification.payer, request.expectedPayer, 'verification')

        const settlement = await this.post<FacilitatorSettleResponse>('/settle', body)
        if (settlement.success !== true) {
            const reason = typeof settlement.errorReason === 'string'
                ? settlement.errorReason
                : 'facilitator did not confirm settlement'
            throw new Error(`Abstract x402 settlement failed: ${reason}`)
        }
        if (settlement.network !== ABSTRACT_MAINNET) {
            throw new Error(`Abstract x402 settled on unexpected network: ${String(settlement.network)}`)
        }
        assertPayer(settlement.payer, request.expectedPayer, 'settlement')
        if (typeof settlement.transaction !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
            throw new Error('Abstract x402 settlement returned an invalid transaction hash')
        }
        return {
            success: true,
            transaction: settlement.transaction,
            network: ABSTRACT_MAINNET,
            payer: request.expectedPayer.toLowerCase(),
        }
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await this.fetchImpl(`${this.facilitatorUrl.replace(/\/$/, '')}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        })
        const value = await response.json().catch(() => undefined)
        if (!response.ok || !value || typeof value !== 'object') {
            throw new Error(`Abstract x402 facilitator ${path} failed with HTTP ${response.status}`)
        }
        return value as T
    }
}

function decodePaymentPayload(encoded: string): Record<string, unknown> {
    let value: unknown
    try {
        value = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    } catch {
        throw new Error('PAYMENT-SIGNATURE must be base64-encoded JSON')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('PAYMENT-SIGNATURE must contain an x402 payment object')
    }
    return value as Record<string, unknown>
}

function assertPayer(actual: unknown, expected: string, stage: string): void {
    if (typeof actual !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`Abstract x402 ${stage} payer does not match the authenticated AGW`)
    }
}

export function createPaymentRequired(
    access: ForumBoardAccessTable,
    resourceUrl: string,
): X402PaymentRequired {
    if (access.chain_id !== 2741) {
        throw new Error(`Unsupported protected-board chain: ${access.chain_id}`)
    }
    if (access.asset.toLowerCase() !== ABSTRACT_USDC) {
        throw new Error(`Unsupported protected-board asset: ${access.asset}`)
    }
    return {
        x402Version: 2,
        error: 'Payment required for protected forum access',
        resource: {
            url: resourceUrl,
            description: `Access to ${access.board_uri}`,
            mimeType: 'application/json',
        },
        accepts: [{
            scheme: 'exact',
            network: ABSTRACT_MAINNET,
            amount: access.amount,
            asset: access.asset,
            payTo: access.pay_to,
            maxTimeoutSeconds: 60,
            extra: {
                name: ABSTRACT_USDC_EIP712_NAME,
                version: ABSTRACT_USDC_EIP712_VERSION,
                boardUri: access.board_uri,
                durationSeconds: access.duration_seconds,
                historyPolicy: access.history_policy,
                issuerDid: access.issuer_did,
            },
        }],
    }
}

export function encodePaymentRequired(value: X402PaymentRequired): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}
