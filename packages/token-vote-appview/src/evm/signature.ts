import { ethers } from 'ethers'

/**
 * Verifies that a signature was produced by the claimed wallet address.
 *
 * The message format for token votes is:
 * "Vote {direction} with {tokenAmount} {tokenContract} on {subjectUri} at {createdAt}"
 *
 * Where direction is "for" (1) or "against" (-1)
 */
export function buildVoteMessage(
    direction: number,
    tokenAmount: string,
    tokenContract: string,
    subjectUri: string,
    createdAt: string,
): string {
    const directionStr = direction === 1 ? 'for' : 'against'
    return `Vote ${directionStr} with ${tokenAmount} ${tokenContract} on ${subjectUri} at ${createdAt}`
}

/**
 * Recovers the signer address from a vote signature.
 * Returns null if signature is invalid.
 */
export function recoverSigner(
    message: string,
    signature: Uint8Array,
): string | null {
    try {
        const sigHex = ethers.hexlify(signature)
        const recovered = ethers.verifyMessage(message, sigHex)
        return recovered.toLowerCase()
    } catch {
        return null
    }
}

/**
 * Verifies that the signature matches the claimed wallet address.
 */
export function verifyVoteSignature(
    walletAddress: string,
    direction: number,
    tokenAmount: string,
    tokenContract: string,
    subjectUri: string,
    createdAt: string,
    signature: Uint8Array,
): boolean {
    const message = buildVoteMessage(
        direction,
        tokenAmount,
        tokenContract,
        subjectUri,
        createdAt,
    )
    const recovered = recoverSigner(message, signature)
    if (!recovered) return false
    return recovered === walletAddress.toLowerCase()
}
