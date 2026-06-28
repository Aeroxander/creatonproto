import { z } from 'zod'

export const onrampOrderRequestSchema = z.object({
    recipientDid: z.string().startsWith('did:').max(2048),
    recipientWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int(),
    receiptEmail: z.string().email().max(320),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    paymentMethodId: z.string().max(128).optional(),
})

export type OnrampOrderRequest = z.infer<typeof onrampOrderRequestSchema>

export type OnrampOrderResponse = {
    orderId: string
    clientSecret: string
}

export type CrossmintOnrampConfig = {
    serverApiKey: string
    env: 'staging' | 'production'
    tokenLocator: string
    allowedChainId: number
    minAmountUsd: number
    maxAmountUsd: number
}

export function crossmintApiHost(env: CrossmintOnrampConfig['env']): string {
    return env === 'production' ? 'https://www.crossmint.com' : 'https://staging.crossmint.com'
}

export function parseAmountUsd(amount: string): number {
    const value = Number.parseFloat(amount)
    if (!Number.isFinite(value)) throw new OnrampValidationError('Amount must be a valid USD number.')
    return value
}

export class OnrampValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OnrampValidationError'
    }
}

export class OnrampConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OnrampConfigError'
    }
}

export class OnrampWalletVerificationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OnrampWalletVerificationError'
    }
}

export function validateOnrampRequest(
    input: OnrampOrderRequest,
    config: CrossmintOnrampConfig,
): void {
    if (input.chainId !== config.allowedChainId) {
        throw new OnrampValidationError(
            `Chain ${input.chainId} is not supported. Expected ${config.allowedChainId}.`,
        )
    }
    const amountUsd = parseAmountUsd(input.amount)
    if (amountUsd < config.minAmountUsd || amountUsd > config.maxAmountUsd) {
        throw new OnrampValidationError(
            `Amount must be between ${config.minAmountUsd} and ${config.maxAmountUsd} USD.`,
        )
    }
}

export async function createCrossmintOnrampOrder(
    input: OnrampOrderRequest,
    config: CrossmintOnrampConfig,
    fetchImpl: typeof fetch = fetch,
): Promise<OnrampOrderResponse> {
    validateOnrampRequest(input, config)
    if (!config.serverApiKey) throw new OnrampConfigError('Crossmint server API key is not configured.')
    if (!config.tokenLocator) throw new OnrampConfigError('Crossmint token locator is not configured.')

    const response = await fetchImpl(`${crossmintApiHost(config.env)}/api/2022-06-09/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.serverApiKey,
        },
        body: JSON.stringify({
            lineItems: [
                {
                    tokenLocator: config.tokenLocator,
                    executionParameters: {
                        mode: 'exact-in',
                        amount: input.amount,
                    },
                },
            ],
            payment: input.paymentMethodId
                ? {
                    method: 'card',
                    receiptEmail: input.receiptEmail,
                    paymentMethodId: input.paymentMethodId,
                }
                : {
                    method: 'card',
                    receiptEmail: input.receiptEmail,
                },
            recipient: {
                walletAddress: input.recipientWallet,
            },
        }),
    })

    const body = await response.json().catch(() => null) as
        | {
            order?: { orderId?: string }
            clientSecret?: string
            message?: string
            error?: string
        }
        | null

    if (!response.ok) {
        const message = body?.message || body?.error || `Crossmint order failed (${response.status})`
        if (response.status === 409) {
            throw new OnrampWalletVerificationError(message)
        }
        throw new Error(message)
    }

    const orderId = body?.order?.orderId
    const clientSecret = body?.clientSecret
    if (!orderId || !clientSecret) {
        throw new Error('Crossmint returned an incomplete checkout response.')
    }

    return { orderId, clientSecret }
}
