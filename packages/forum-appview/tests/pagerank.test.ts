import { describe, expect, test } from 'bun:test'
import { computePageRank } from '../src/graph/pagerank'
import { cosineSimilarity, embedText } from '../src/graph/embeddings'

describe('computePageRank', () => {
    test('returns higher score for well-linked node', () => {
        const ranks = computePageRank([
            { follower: 'a', subject: 'b' },
            { follower: 'c', subject: 'b' },
            { follower: 'b', subject: 'c' },
        ])
        expect(ranks.get('b') ?? 0).toBeGreaterThan(ranks.get('a') ?? 0)
    })
})

describe('embeddings', () => {
    test('similar text has higher cosine similarity', () => {
        const a = embedText('animatic pacing feedback for studio release')
        const b = embedText('animatic pacing notes from community review')
        const c = embedText('unrelated blockchain wallet integration')
        expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c))
    })
})
