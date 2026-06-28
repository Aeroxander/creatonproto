import { encodePacked, keccak256, stringToHex, type Address, type Hex } from 'viem'
import type { ForumBoardAccessTable } from '../db/schema'

export interface MppSettlementResult {
    transaction: Hex
    payer: Address
    paymentRef: Hex
    subjectHash: Hex
    policyHash: Hex
}

export function deriveAccessPolicyBinding(access: ForumBoardAccessTable, did: string, payer: Address) {
    const boardId = keccak256(stringToHex(access.board_uri))
    const subjectHash = keccak256(encodePacked(['string', 'address'], [did, payer]))
    return { boardId, subjectHash, policyHash: deriveBoardPolicyHash(access) }
}

export function deriveBoardPolicyHash(access: ForumBoardAccessTable) {
    return keccak256(stringToHex(canonicalJson({
        boardUri: access.board_uri,
        chainId: access.chain_id,
        asset: access.asset.toLowerCase(),
        amount: access.amount,
        durationSeconds: access.duration_seconds,
        historyPolicy: access.history_policy,
        revenueRouter: access.revenue_router?.toLowerCase(),
        committeeRegistry: access.committee_registry?.toLowerCase(),
        entitlementRegistry: access.entitlement_registry?.toLowerCase(),
        committeeSize: access.committee_size,
        committeeThreshold: access.committee_threshold,
    })))
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}
