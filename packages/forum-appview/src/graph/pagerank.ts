const DEFAULT_DAMPING = 0.85
const DEFAULT_ITERATIONS = 20

export function computePageRank(
    edges: { follower: string; subject: string }[],
    damping = DEFAULT_DAMPING,
    iterations = DEFAULT_ITERATIONS,
): Map<string, number> {
    const nodes = new Set<string>()
    const outLinks = new Map<string, Set<string>>()
    const inLinks = new Map<string, Set<string>>()

    for (const edge of edges) {
        nodes.add(edge.follower)
        nodes.add(edge.subject)
        if (!outLinks.has(edge.follower)) outLinks.set(edge.follower, new Set())
        if (!inLinks.has(edge.subject)) inLinks.set(edge.subject, new Set())
        outLinks.get(edge.follower)!.add(edge.subject)
        inLinks.get(edge.subject)!.add(edge.follower)
    }

    if (nodes.size === 0) return new Map()

    const n = nodes.size
    const teleport = (1 - damping) / n
    let ranks = new Map<string, number>()
    for (const node of nodes) ranks.set(node, 1 / n)

    for (let i = 0; i < iterations; i += 1) {
        const next = new Map<string, number>()
        for (const node of nodes) next.set(node, teleport)

        for (const node of nodes) {
            const out = outLinks.get(node)
            const rank = ranks.get(node) ?? 0
            if (!out || out.size === 0) {
                for (const target of nodes) {
                    next.set(target, (next.get(target) ?? 0) + damping * rank / n)
                }
            } else {
                const share = damping * rank / out.size
                for (const target of out) {
                    next.set(target, (next.get(target) ?? 0) + share)
                }
            }
        }
        ranks = next
    }

    return ranks
}

export function parseDidFromAtUri(uri: string): string | null {
    const match = uri.match(/^at:\/\/([^/]+)\//)
    return match?.[1] ?? null
}
