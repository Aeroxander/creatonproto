import assert from 'node:assert/strict'
import test from 'node:test'
import { keccak256, stringToHex } from 'viem'
import { calculateRewards } from '../src/jobs/reward-calculation'
import { chunkDataset } from '../src/issuer/snapshot-publisher'

test('allocates the full pool with deterministic largest remainders', () => {
    const votes = [
        vote('1', 'did:v1', 'at://a/1', 'did:a'),
        vote('2', 'did:v2', 'at://a/1', 'did:a'),
        vote('3', 'did:v1', 'at://a/2', 'did:a'),
        vote('4', 'did:v2', 'at://b/1', 'did:b'),
        vote('5', 'did:a', 'at://a/2', 'did:a'),
        vote('6', 'did:ineligible', 'at://b/1', 'did:b'),
    ]
    const result = calculateRewards({
        boardId: keccak256(stringToHex('at://board')),
        epochId: 10n,
        votes,
        eligibleVoters: new Map([['did:v1', '0x1'], ['did:v2', '0x2'], ['did:a', '0x3']]),
        totalAmount: 10n,
    })
    assert.deepEqual(result.allocations.map((row) => [row.did, row.amount]), [['did:a', 7n], ['did:b', 3n]])
    assert.equal(result.allocations.reduce((sum, row) => sum + row.amount, 0n), 10n)
    assert.match(result.dataset.toString(), /"type":"allocation"/)
})

test('PDS chunks are deterministic and below four MiB', () => {
    const dataset = Buffer.from(`${JSON.stringify({ type: 'vote', value: 'x'.repeat(1_000) })}\n`.repeat(20))
    const first = chunkDataset(dataset)
    const second = chunkDataset(dataset)
    assert.deepEqual(first, second)
    assert.ok(first.every((chunk) => chunk.length <= 4 * 1024 * 1024))
})

function vote(uri: string, voterDid: string, subjectUri: string, authorDid: string) {
    return {
        uri, voterDid, subjectUri, authorDid, direction: 'up' as const,
        createdAt: `2026-06-0${uri}T00:00:00.000Z`,
    }
}
