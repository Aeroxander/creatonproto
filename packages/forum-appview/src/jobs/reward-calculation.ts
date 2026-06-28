import { createHash } from 'node:crypto'
import { encodeAbiParameters, keccak256, stringToHex, type Hex } from 'viem'

export type RewardVote = {
    uri: string
    voterDid: string
    subjectUri: string
    authorDid: string
    direction: 'up' | 'down'
    createdAt: string
}

export type RewardAllocation = {
    did: string
    didHash: Hex
    amount: bigint
    weight: number
    leaf: Hex
    proof: Hex[]
}

export type RewardExclusion = {
    type: 'exclusion'
    reason: 'subject_hidden' | 'subject_rejected' | 'author_banned' | 'voter_banned'
    boardUri: string
    subjectUri?: string
    did?: string
    sourceUri: string
    sourceCid?: string | null
    effectiveAt: string
}

export function calculateRewards(input: {
    boardId: Hex
    epochId: bigint
    votes: RewardVote[]
    eligibleVoters: Map<string, string>
    totalAmount: bigint
    exclusions?: RewardExclusion[]
}): { allocations: RewardAllocation[]; merkleRoot: Hex; dataset: Buffer; datasetHash: string } {
    const actions = input.votes
        .filter((vote) => vote.voterDid !== vote.authorDid && input.eligibleVoters.has(vote.voterDid))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.uri.localeCompare(b.uri))

    const accepted: Array<RewardVote & { voterWallet: string }> = []
    const voterCount = new Map<string, number>()
    const seen = new Set<string>()
    for (const vote of actions) {
        const voterWallet = input.eligibleVoters.get(vote.voterDid)!
        const key = `${voterWallet}\u0000${vote.subjectUri}`
        if (seen.has(key) || (voterCount.get(voterWallet) ?? 0) >= 20) continue
        seen.add(key)
        voterCount.set(voterWallet, (voterCount.get(voterWallet) ?? 0) + 1)
        accepted.push({ ...vote, voterWallet })
    }

    const subjects = new Map<string, { authorDid: string; up: number; down: number }>()
    for (const vote of accepted) {
        const subject = subjects.get(vote.subjectUri) ?? { authorDid: vote.authorDid, up: 0, down: 0 }
        if (vote.direction === 'up') subject.up += 1
        else subject.down += 1
        subjects.set(vote.subjectUri, subject)
    }

    const byAuthor = new Map<string, Array<{ uri: string; weight: number }>>()
    for (const [uri, subject] of subjects) {
        const weight = Math.floor(Math.sqrt(Math.max(subject.up - subject.down, 0)))
        if (!weight) continue
        const rows = byAuthor.get(subject.authorDid) ?? []
        rows.push({ uri, weight })
        byAuthor.set(subject.authorDid, rows)
    }

    const weighted = [...byAuthor].map(([did, rows]) => ({
        did,
        didHash: keccak256(stringToHex(did)),
        weight: rows.sort((a, b) => b.weight - a.weight || a.uri.localeCompare(b.uri))
            .slice(0, 5).reduce((sum, row) => sum + row.weight, 0),
    })).filter((row) => row.weight > 0).sort((a, b) => a.didHash.localeCompare(b.didHash))

    const totalWeight = weighted.reduce((sum, row) => sum + BigInt(row.weight), 0n)
    const amounts = weighted.map((row) => {
        const numerator = input.totalAmount * BigInt(row.weight)
        return { ...row, amount: totalWeight ? numerator / totalWeight : 0n, remainder: totalWeight ? numerator % totalWeight : 0n }
    })
    let undistributed = input.totalAmount - amounts.reduce((sum, row) => sum + row.amount, 0n)
    const remainderOrder = [...amounts].sort((a, b) => {
        if (a.remainder === b.remainder) return a.didHash.localeCompare(b.didHash)
        return a.remainder > b.remainder ? -1 : 1
    })
    for (let i = 0; undistributed > 0n && i < remainderOrder.length; ++i, --undistributed) remainderOrder[i].amount += 1n

    const allocations = amounts.filter((row) => row.amount > 0n).map((row) => ({
        did: row.did, didHash: row.didHash, amount: row.amount, weight: row.weight,
        leaf: keccak256(encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes32' }, { type: 'uint256' }],
            [input.boardId, input.epochId, row.didHash, row.amount],
        )),
        proof: [] as Hex[],
    }))
    const tree = merkleTree(allocations.map((row) => row.leaf))
    allocations.forEach((row, index) => { row.proof = tree.proofs[index] })

    const lines = [
        ...(input.exclusions ?? [])
            .sort((a, b) => (a.subjectUri ?? a.did ?? '').localeCompare(b.subjectUri ?? b.did ?? '') ||
                a.reason.localeCompare(b.reason) || a.sourceUri.localeCompare(b.sourceUri))
            .map((row) => JSON.stringify(row)),
        ...accepted.map((vote) => JSON.stringify({ type: 'vote', ...vote })),
        ...allocations.map((row) => JSON.stringify({
            type: 'allocation', did: row.did, didHash: row.didHash, weight: row.weight,
            amount: row.amount.toString(), leaf: row.leaf, proof: row.proof,
        })),
    ]
    const dataset = Buffer.from(`${lines.join('\n')}\n`)
    return {
        allocations,
        merkleRoot: tree.root,
        dataset,
        datasetHash: createHash('sha256').update(dataset).digest('hex'),
    }
}

function merkleTree(leaves: Hex[]): { root: Hex; proofs: Hex[][] } {
    if (!leaves.length) return { root: `0x${'00'.repeat(32)}`, proofs: [] }
    const layers: Hex[][] = [leaves]
    while (layers.at(-1)!.length > 1) {
        const current = layers.at(-1)!
        const next: Hex[] = []
        for (let i = 0; i < current.length; i += 2) {
            const right = current[i + 1] ?? current[i]
            const pair = current[i].localeCompare(right) <= 0 ? [current[i], right] : [right, current[i]]
            next.push(keccak256(`0x${pair[0].slice(2)}${pair[1].slice(2)}`))
        }
        layers.push(next)
    }
    const proofs = leaves.map((_, leafIndex) => {
        const proof: Hex[] = []
        let index = leafIndex
        for (let level = 0; level < layers.length - 1; ++level) {
            const layer = layers[level]
            proof.push(layer[index ^ 1] ?? layer[index])
            index = Math.floor(index / 2)
        }
        return proof
    })
    return { root: layers.at(-1)![0], proofs }
}
