import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
    createCrossmintOnrampOrder,
    crossmintApiHost,
    OnrampValidationError,
    parseAmountUsd,
    validateOnrampRequest,
    type CrossmintOnrampConfig,
} from '../src/onramp/crossmint'

const config: CrossmintOnrampConfig = {
    serverApiKey: 'test-server-key',
    env: 'staging',
    tokenLocator: 'base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    allowedChainId: 42429,
    minAmountUsd: 1,
    maxAmountUsd: 100,
}

const validRequest = {
    recipientDid: 'did:plc:example',
    recipientWallet: '0x0000000000000000000000000000000000000001',
    chainId: 42429,
    receiptEmail: 'user@example.com',
    amount: '10',
}

describe('crossmint onramp', () => {
    afterEach(() => {
        // no-op
    })

    test('crossmintApiHost selects staging or production host', () => {
        assert.equal(crossmintApiHost('staging'), 'https://staging.crossmint.com')
        assert.equal(crossmintApiHost('production'), 'https://www.crossmint.com')
    })

    test('parseAmountUsd accepts whole and decimal amounts', () => {
        assert.equal(parseAmountUsd('5'), 5)
        assert.equal(parseAmountUsd('5.50'), 5.5)
    })

    test('validateOnrampRequest rejects unsupported chain', () => {
        assert.throws(
            () => validateOnrampRequest({ ...validRequest, chainId: 1 }, config),
            OnrampValidationError,
        )
    })

    test('validateOnrampRequest rejects out-of-range amounts', () => {
        assert.throws(
            () => validateOnrampRequest({ ...validRequest, amount: '0.50' }, config),
            OnrampValidationError,
        )
        assert.throws(
            () => validateOnrampRequest({ ...validRequest, amount: '150' }, config),
            OnrampValidationError,
        )
    })

    test('createCrossmintOnrampOrder posts to Crossmint and returns credentials', async () => {
        let capturedUrl = ''
        let capturedBody: unknown
        const fetchImpl = async (url: string, init?: RequestInit) => {
            capturedUrl = url
            capturedBody = JSON.parse(String(init?.body))
            return new Response(JSON.stringify({
                order: { orderId: 'order-123' },
                clientSecret: 'secret-abc',
            }), { status: 200 })
        }

        const result = await createCrossmintOnrampOrder(validRequest, config, fetchImpl)
        assert.equal(result.orderId, 'order-123')
        assert.equal(result.clientSecret, 'secret-abc')
        assert.equal(capturedUrl, 'https://staging.crossmint.com/api/2022-06-09/orders')
        assert.deepEqual(capturedBody, {
            lineItems: [{
                tokenLocator: config.tokenLocator,
                executionParameters: { mode: 'exact-in', amount: '10' },
            }],
            payment: { method: 'card', receiptEmail: 'user@example.com' },
            recipient: { walletAddress: validRequest.recipientWallet },
        })
    })

    test('createCrossmintOnrampOrder maps Crossmint errors', async () => {
        const fetchImpl = async () => new Response(
            JSON.stringify({ message: 'Wallet verification required' }),
            { status: 409 },
        )
        await assert.rejects(
            () => createCrossmintOnrampOrder(validRequest, config, fetchImpl),
            /Wallet verification required/,
        )
    })
})
