import { ethers } from 'ethers'

// ERC-20 balanceOf ABI
const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)']

export class EvmRpcClient {
    private providers: Map<number, ethers.JsonRpcProvider> = new Map()
    private defaultRpcUrl: string

    constructor(defaultRpcUrl: string) {
        this.defaultRpcUrl = defaultRpcUrl
    }

    private getProvider(chainId: number): ethers.JsonRpcProvider {
        let provider = this.providers.get(chainId)
        if (!provider) {
            provider = new ethers.JsonRpcProvider(this.defaultRpcUrl)
            this.providers.set(chainId, provider)
        }
        return provider
    }

    async getTokenBalance(
        walletAddress: string,
        tokenContract: string,
        chainId: number,
    ): Promise<bigint> {
        const provider = this.getProvider(chainId)
        const contract = new ethers.Contract(tokenContract, ERC20_ABI, provider)
        const balance = await contract.balanceOf(walletAddress)
        return balance
    }

    /**
     * Fetch ERC-20 Transfer logs where `to` equals the target wallet.
     * Used to determine how long a wallet has held tokens before voting.
     *
     * topic0 = Transfer(address,address,uint256) keccak
     * topic2 = Transfer recipient (indexed `to`)
     */
    async getLogs(
        tokenContract: string,
        topic0: string,
        paddedRecipient: string,  // 32-byte zero-padded address (no 0x prefix)
        chainId: number,
    ): Promise<{ blockNumber: number }[]> {
        const provider = this.getProvider(chainId)
        try {
            const logs = await provider.getLogs({
                address: tokenContract,
                topics: [
                    topic0,
                    null,                       // topic1: from (any)
                    '0x' + paddedRecipient,     // topic2: to = wallet
                ],
                fromBlock: 0,
                toBlock: 'latest',
            })
            return logs.map((l) => ({ blockNumber: l.blockNumber }))
        } catch (err) {
            console.error('[EvmRpcClient] getLogs failed:', err)
            return []
        }
    }

    /**
     * Get the timestamp (in milliseconds) for a given block number.
     * Returns null if the block cannot be fetched.
     */
    async getBlockTimestamp(blockNumber: number, chainId: number): Promise<number | null> {
        const provider = this.getProvider(chainId)
        try {
            const block = await provider.getBlock(blockNumber)
            if (!block) return null
            return block.timestamp * 1000 // convert seconds → ms
        } catch (err) {
            console.error('[EvmRpcClient] getBlock failed:', err)
            return null
        }
    }
}
