import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database, ForumBillingProfileTable, ForumEntitlementTable, ForumKeyGrantTable, ForumX402ReceiptTable } from '../db/schema'

export type NonceKind = 'service-jwt' | 'session'

export interface CreateEntitlement {
    boardUri: string
    did: string
    walletAddress: string
    startsAt: Date
    expiresAt: Date
    source: 'mpp' | 'x402' | 'staff' | 'tempo'
    paymentRef?: string
}

export interface CreateReceipt {
    id?: string
    boardUri: string
    did: string
    walletAddress: string
    network: string
    txHash?: string
    amount: string
    asset: string
    payTo: string
    status: 'pending' | 'settled' | 'failed'
}

export interface CreateGrantAudit {
    grantId: string
    uri?: string
    boardUri: string
    did: string
    walletAddress: string
    sessionKeyHash: string
    certificateHash: string
    epochFrom: string
    epochTo: string
    expiresAt: Date
    status?: 'issued' | 'published' | 'revoked'
}

export class IssuerAccessStore {
    constructor(private readonly db: Kysely<Database>) {}

    async issueNonce(nonce: string, kind: NonceKind, expiresAt: Date): Promise<void> {
        const now = new Date()
        if (expiresAt <= now) throw new Error('Nonce expiry must be in the future')
        await this.db
            .insertInto('issuer_nonce')
            .values({
                nonce,
                kind,
                expires_at: expiresAt.toISOString(),
                created_at: now.toISOString(),
            })
            .execute()
    }

    async claimNonce(nonce: string, kind: NonceKind, expiresAt: Date): Promise<boolean> {
        if (expiresAt <= new Date()) return false
        try {
            await this.issueNonce(nonce, kind, expiresAt)
            return true
        } catch (error) {
            const existing = await this.db
                .selectFrom('issuer_nonce')
                .select('nonce')
                .where('nonce', '=', nonce)
                .executeTakeFirst()
            if (existing) return false
            throw error
        }
    }

    async consumeNonce(nonce: string, kind: NonceKind, now = new Date()): Promise<boolean> {
        return this.db.transaction().execute(async (tx) => {
            const row = await tx
                .selectFrom('issuer_nonce')
                .select(['nonce', 'expires_at'])
                .where('nonce', '=', nonce)
                .where('kind', '=', kind)
                .executeTakeFirst()
            if (!row) return false
            await tx.deleteFrom('issuer_nonce').where('nonce', '=', nonce).execute()
            return row.expires_at > now.toISOString()
        })
    }

    async pruneNonces(now = new Date()): Promise<number> {
        const result = await this.db
            .deleteFrom('issuer_nonce')
            .where('expires_at', '<=', now.toISOString())
            .executeTakeFirst()
        return Number(result.numDeletedRows)
    }

    async createEntitlement(input: CreateEntitlement): Promise<ForumEntitlementTable> {
        if (input.expiresAt <= input.startsAt) {
            throw new Error('Entitlement expiry must be after its start')
        }
        const row: ForumEntitlementTable = {
            id: randomUUID(),
            board_uri: input.boardUri,
            did: input.did,
            wallet_address: normalizeAddress(input.walletAddress),
            starts_at: input.startsAt.toISOString(),
            expires_at: input.expiresAt.toISOString(),
            source: input.source,
            payment_ref: input.paymentRef ?? null,
            created_at: new Date().toISOString(),
        }
        await this.db.insertInto('forum_entitlement').values(row).execute()
        return row
    }

    async findActiveEntitlement(
        boardUri: string,
        did: string,
        walletAddress: string,
        now = new Date(),
    ): Promise<ForumEntitlementTable | undefined> {
        const timestamp = now.toISOString()
        return this.db
            .selectFrom('forum_entitlement')
            .selectAll()
            .where('board_uri', '=', boardUri)
            .where('did', '=', did)
            .where('wallet_address', '=', normalizeAddress(walletAddress))
            .where('starts_at', '<=', timestamp)
            .where('expires_at', '>', timestamp)
            .orderBy('expires_at', 'desc')
            .executeTakeFirst()
    }

    async createReceipt(input: CreateReceipt): Promise<ForumX402ReceiptTable> {
        const row: ForumX402ReceiptTable = {
            id: input.id ?? randomUUID(),
            board_uri: input.boardUri,
            did: input.did,
            wallet_address: normalizeAddress(input.walletAddress),
            network: input.network,
            tx_hash: input.txHash ?? null,
            amount: input.amount,
            asset: input.asset,
            pay_to: normalizeAddress(input.payTo),
            status: input.status,
            created_at: new Date().toISOString(),
        }
        await this.db.insertInto('forum_x402_receipt').values(row).execute()
        return row
    }

    async getReceipt(id: string): Promise<ForumX402ReceiptTable | undefined> {
        return this.db
            .selectFrom('forum_x402_receipt')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    }

    async markReceiptSettled(id: string, transaction: string): Promise<void> {
        const result = await this.db
            .updateTable('forum_x402_receipt')
            .set({ status: 'settled', tx_hash: transaction })
            .where('id', '=', id)
            .where('status', '=', 'pending')
            .executeTakeFirst()
        if (Number(result.numUpdatedRows) !== 1) {
            const existing = await this.getReceipt(id)
            if (existing?.status !== 'settled' || existing.tx_hash?.toLowerCase() !== transaction.toLowerCase()) {
                throw new Error('Could not persist payment settlement receipt')
            }
        }
    }

    async findEntitlementByPaymentRef(paymentRef: string): Promise<ForumEntitlementTable | undefined> {
        return this.db
            .selectFrom('forum_entitlement')
            .selectAll()
            .where('payment_ref', '=', paymentRef)
            .executeTakeFirst()
    }

    async getBoardRef(boardUri: string): Promise<{ uri: string; cid: string } | undefined> {
        const row = await this.db
            .selectFrom('forum_board_ref')
            .select(['board_uri', 'cid'])
            .where('board_uri', '=', boardUri)
            .executeTakeFirst()
        return row ? { uri: row.board_uri, cid: row.cid } : undefined
    }

    async createGrantAudit(input: CreateGrantAudit): Promise<ForumKeyGrantTable> {
        const row: ForumKeyGrantTable = {
            grant_id: input.grantId,
            uri: input.uri ?? null,
            board_uri: input.boardUri,
            did: input.did,
            wallet_address: normalizeAddress(input.walletAddress),
            session_key_hash: input.sessionKeyHash,
            certificate_hash: input.certificateHash,
            epoch_from: input.epochFrom,
            epoch_to: input.epochTo,
            expires_at: input.expiresAt.toISOString(),
            status: input.status ?? 'issued',
            created_at: new Date().toISOString(),
        }
        await this.db.insertInto('forum_key_grant').values(row).execute()
        return row
    }

    async getBillingProfile(did: string): Promise<ForumBillingProfileTable | undefined> {
        return this.db.selectFrom('forum_billing_profile').selectAll().where('did', '=', did).executeTakeFirst()
    }

    async upsertBillingProfile(input: {
        did: string
        walletAddress: string
        crossmintPaymentMethodId?: string | null
        enrollmentStatus?: ForumBillingProfileTable['enrollment_status']
        serverSignerAuthorized?: boolean
        autoRenewEnabled?: boolean
        billingTier?: ForumBillingProfileTable['billing_tier']
        receiptEmail?: string | null
    }): Promise<ForumBillingProfileTable> {
        const now = new Date().toISOString()
        const existing = await this.getBillingProfile(input.did)
        const row: ForumBillingProfileTable = {
            did: input.did,
            wallet_address: normalizeAddress(input.walletAddress),
            crossmint_payment_method_id:
                input.crossmintPaymentMethodId ?? existing?.crossmint_payment_method_id ?? null,
            enrollment_status: input.enrollmentStatus ?? existing?.enrollment_status ?? 'not_started',
            server_signer_authorized:
                input.serverSignerAuthorized === undefined
                    ? (existing?.server_signer_authorized ?? 0)
                    : input.serverSignerAuthorized ? 1 : 0,
            auto_renew_enabled:
                input.autoRenewEnabled === undefined
                    ? (existing?.auto_renew_enabled ?? 0)
                    : input.autoRenewEnabled ? 1 : 0,
            billing_tier: input.billingTier ?? existing?.billing_tier ?? 'manual',
            receipt_email: input.receiptEmail ?? existing?.receipt_email ?? null,
            updated_at: now,
            created_at: existing?.created_at ?? now,
        }
        if (existing) {
            await this.db.updateTable('forum_billing_profile').set(row).where('did', '=', input.did).execute()
        } else {
            await this.db.insertInto('forum_billing_profile').values(row).execute()
        }
        return row
    }

    async listExpiringEntitlements(withinMs: number, now = new Date()): Promise<ForumEntitlementTable[]> {
        const until = new Date(now.getTime() + withinMs).toISOString()
        const timestamp = now.toISOString()
        return this.db
            .selectFrom('forum_entitlement')
            .selectAll()
            .where('expires_at', '>', timestamp)
            .where('expires_at', '<=', until)
            .execute()
    }
}

function normalizeAddress(address: string): string {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new Error('Expected a 20-byte EVM address')
    }
    return address.toLowerCase()
}
