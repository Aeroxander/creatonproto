import cron from 'node-cron'
import { Kysely } from 'kysely'
import {
    createPublicClient,
    createWalletClient,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Database } from '../db/schema'
import { tempoMainnet } from '../issuer/tempo'

const TRIGGER_ABI = parseAbi(['function addTrigger(bytes data)'])
const DID_WALLET_ABI = parseAbi([
    'function walletOf(bytes32 didHash) view returns (address)',
    'function versionOf(bytes32 didHash) view returns (uint64)',
])

export class WalletAttestationJob {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly rpcUrl: string,
        private readonly snapshotPds: string,
        private readonly trigger: Address,
        private readonly triggerPrivateKey: Hex,
        private readonly didWalletRegistry?: Address,
    ) {}

    schedule() {
        cron.schedule('*/5 * * * *', () => {
            this.triggerPending().catch((error) => console.error('Wallet attestation trigger failed:', error))
        }, { timezone: 'UTC' })
    }

    async triggerPending(): Promise<number> {
        const rows = await this.db.selectFrom('forum_wallet_attestation').selectAll()
            .where('status', '=', 'pending')
            .orderBy('created_at')
            .limit(50)
            .execute()
        if (!rows.length) return 0

        let triggered = 0
        for (const row of rows) {
            const rkey = row.uri.split('/').at(-1)
            if (!rkey || !row.cid) {
                await this.markFailed(row.uri)
                continue
            }
            const chain = tempoMainnet
            const client = createPublicClient({ chain, transport: http(this.rpcUrl) })
            if (this.didWalletRegistry) {
                const didHash = keccak256(stringToHex(row.did))
                const [wallet, version] = await Promise.all([
                    client.readContract({
                        address: this.didWalletRegistry,
                        abi: DID_WALLET_ABI,
                        functionName: 'walletOf',
                        args: [didHash],
                    }),
                    client.readContract({
                        address: this.didWalletRegistry,
                        abi: DID_WALLET_ABI,
                        functionName: 'versionOf',
                        args: [didHash],
                    }),
                ])
                if (wallet.toLowerCase() === row.address && version >= BigInt(row.version)) {
                    await this.db.updateTable('forum_wallet_attestation')
                        .set({ status: 'attested', updated_at: new Date().toISOString() })
                        .where('uri', '=', row.uri)
                        .execute()
                    continue
                }
            }
            if (row.trigger_tx) continue
            const wallet = createWalletClient({
                account: privateKeyToAccount(this.triggerPrivateKey),
                chain,
                transport: http(this.rpcUrl),
            })
            const payload = stringToHex(JSON.stringify({
                kind: 'didWallet',
                pds: this.snapshotPds,
                repo: row.did,
                rkey,
                recordCid: row.cid,
                didHash: keccak256(stringToHex(row.did)),
                expectedVersion: row.version,
                rpcUrl: this.rpcUrl,
            }))
            try {
                const tx = await wallet.writeContract({
                    address: this.trigger,
                    abi: TRIGGER_ABI,
                    functionName: 'addTrigger',
                    args: [payload],
                })
                await client.waitForTransactionReceipt({ hash: tx })
                await this.db.updateTable('forum_wallet_attestation')
                    .set({ trigger_tx: tx, updated_at: new Date().toISOString() })
                    .where('uri', '=', row.uri)
                    .execute()
                triggered += 1
            } catch {
                await this.markFailed(row.uri)
            }
        }
        return triggered
    }

    private async markFailed(uri: string) {
        await this.db.updateTable('forum_wallet_attestation')
            .set({ status: 'failed', updated_at: new Date().toISOString() })
            .where('uri', '=', uri)
            .execute()
    }
}
