import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema'

const KEY_BYTES = 32
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16

export interface EpochKey {
    epoch: string
    key: Uint8Array
}

export function parseKeyEncryptionSecret(value: string): Buffer {
    const key = Buffer.from(value, 'base64')
    if (key.byteLength !== KEY_BYTES) {
        throw new Error('FORUM_KEY_ENCRYPTION_SECRET must be 32 base64-encoded bytes')
    }
    return key
}

export class EpochKeyStore {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly encryptionKey: Buffer,
    ) {
        if (encryptionKey.byteLength !== KEY_BYTES) {
            throw new Error('Epoch-key encryption key must contain exactly 32 bytes')
        }
    }

    async getOrCreate(boardUri: string, epoch: string): Promise<EpochKey> {
        const existing = await this.get(boardUri, epoch)
        if (existing) return existing

        const key = randomBytes(KEY_BYTES)
        const encrypted = this.encrypt(boardUri, epoch, key)
        try {
            await this.db
                .insertInto('forum_epoch_key')
                .values({
                    board_uri: boardUri,
                    epoch,
                    ...encrypted,
                    created_at: new Date().toISOString(),
                })
                .execute()
            return { epoch, key }
        } catch (error) {
            // A concurrent issuer request may have won the composite-key insert.
            const winner = await this.get(boardUri, epoch)
            if (winner) return winner
            throw error
        }
    }

    async get(boardUri: string, epoch: string): Promise<EpochKey | undefined> {
        const row = await this.db
            .selectFrom('forum_epoch_key')
            .selectAll()
            .where('board_uri', '=', boardUri)
            .where('epoch', '=', epoch)
            .executeTakeFirst()
        if (!row) return undefined
        return {
            epoch: row.epoch,
            key: this.decrypt(row.board_uri, row.epoch, row.encrypted_key, row.nonce, row.auth_tag),
        }
    }

    async listThrough(boardUri: string, throughEpoch: string, limit = 256): Promise<EpochKey[]> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 256) {
            throw new Error('Epoch-key grant limit must be between 1 and 256')
        }
        const rows = await this.db
            .selectFrom('forum_epoch_key')
            .selectAll()
            .where('board_uri', '=', boardUri)
            .where('epoch', '<=', throughEpoch)
            .orderBy('epoch', 'desc')
            .limit(limit)
            .execute()
        return rows.reverse().map((row) => ({
            epoch: row.epoch,
            key: this.decrypt(row.board_uri, row.epoch, row.encrypted_key, row.nonce, row.auth_tag),
        }))
    }

    async listAllThrough(boardUri: string, throughEpoch: string, maxKeys = 3_650): Promise<EpochKey[]> {
        if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 3_650) {
            throw new Error('Historical epoch-key limit must be between 1 and 3650')
        }
        const rows = await this.db
            .selectFrom('forum_epoch_key')
            .selectAll()
            .where('board_uri', '=', boardUri)
            .where('epoch', '<=', throughEpoch)
            .orderBy('epoch', 'asc')
            .limit(maxKeys + 1)
            .execute()
        if (rows.length > maxKeys) {
            throw new Error(`Board history exceeds the configured ${maxKeys}-epoch grant limit`)
        }
        return rows.map((row) => ({
            epoch: row.epoch,
            key: this.decrypt(row.board_uri, row.epoch, row.encrypted_key, row.nonce, row.auth_tag),
        }))
    }

    private encrypt(boardUri: string, epoch: string, key: Buffer) {
        const nonce = randomBytes(NONCE_BYTES)
        const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce, {
            authTagLength: AUTH_TAG_BYTES,
        })
        cipher.setAAD(this.aad(boardUri, epoch))
        const encryptedKey = Buffer.concat([cipher.update(key), cipher.final()])
        return {
            encrypted_key: encryptedKey,
            nonce,
            auth_tag: cipher.getAuthTag(),
        }
    }

    private decrypt(
        boardUri: string,
        epoch: string,
        encryptedKey: Buffer,
        nonce: Buffer,
        authTag: Buffer,
    ): Buffer {
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, nonce, {
            authTagLength: AUTH_TAG_BYTES,
        })
        decipher.setAAD(this.aad(boardUri, epoch))
        decipher.setAuthTag(authTag)
        return Buffer.concat([decipher.update(encryptedKey), decipher.final()])
    }

    private aad(boardUri: string, epoch: string): Buffer {
        return Buffer.from(`creaton:forum-epoch-key:v1\n${boardUri}\n${epoch}`, 'utf8')
    }
}
