const VECTOR_DIM = 128

function tokenize(text: string) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2)
}

function hashToken(token: string, dim: number) {
    let hash = 0x811c9dc5
    for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return Math.abs(hash) % dim
}

export function embedText(text: string, dim = VECTOR_DIM): Float32Array {
    const vector = new Float32Array(dim)
    for (const token of tokenize(text)) {
        const index = hashToken(token, dim)
        vector[index] += 1
    }
    let norm = 0
    for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i]
    norm = Math.sqrt(norm)
    if (norm > 0) {
        for (let i = 0; i < vector.length; i += 1) vector[i] /= norm
    }
    return vector
}

export function serializeVector(vector: Float32Array): Buffer {
    return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
}

export function deserializeVector(buffer: Buffer, dim = VECTOR_DIM): Float32Array {
    if (buffer.byteLength === dim * 4) {
        return new Float32Array(buffer.buffer, buffer.byteOffset, dim)
    }
    return embedText('')
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export const EMBEDDING_DIM = VECTOR_DIM
