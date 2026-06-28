import { describe, expect, test } from 'bun:test'

import { ForumKmsClient } from '../src/issuer/kms-client'

describe('ForumKmsClient', () => {
    test('collects ten distinct matching operator partials', async () => {
        const endpoints = Array.from({ length: 15 }, (_, index) => `https://kms-${index}.example`).join(',')
        const fetchImpl = async (input: string | URL | Request) => {
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
            const index = Number(url.hostname.match(/kms-(\d+)/)?.[1])
            return Response.json({
                receipt: receipt(),
                share: { requestHash: '0xrequest', committeeEpoch: 4,
                    operatorId: `0x${index.toString(16).padStart(40, '0')}`, shareIndex: index + 1 },
            })
        }
        const result = await new ForumKmsClient(endpoints, undefined, fetchImpl as typeof fetch)
            .requestRelease({ boardUri: 'at://board' })
        expect(result.receipt).toEqual(receipt())
        expect(result.shares).toHaveLength(10)
        expect(new Set(result.shares.map((share) => share.operatorId)).size).toBe(10)
    })

    test('rejects responses that do not form one receipt quorum', async () => {
        const endpoints = Array.from({ length: 15 }, (_, index) => `https://kms-${index}.example`).join(',')
        const fetchImpl = async (input: string | URL | Request) => {
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
            const index = Number(url.hostname.match(/kms-(\d+)/)?.[1])
            const value = receipt()
            value.requestHash = index < 8 ? '0xa' : '0xb'
            return Response.json({ receipt: value, share: {
                requestHash: value.requestHash, committeeEpoch: 4,
                operatorId: `operator-${index}`, shareIndex: index + 1,
            } })
        }
        await expect(new ForumKmsClient(endpoints, undefined, fetchImpl as typeof fetch)
            .requestRelease({ boardUri: 'at://board' })).rejects.toThrow('KMS threshold unavailable')
    })
})

function receipt() {
    return {
        requestId: '0xrequest', requestHash: '0xrequest', boardUri: 'at://board', subjectHash: '0xsubject',
        committeeEpoch: 4, eligibilityBlock: '123', policyHash: '0xpolicy', expiresAt: '2030-01-01T00:00:00Z',
    }
}
