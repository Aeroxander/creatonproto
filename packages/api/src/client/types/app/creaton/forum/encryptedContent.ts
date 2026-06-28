/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.forum.encryptedContent'

/** An authenticated Creaton forum body encrypted under a board epoch key. */
export interface Main {
  $type?: 'app.creaton.forum.encryptedContent'
  version: number
  suite: 'HKDF-SHA256/AES-256-GCM' | (string & {})
  /** UTC key epoch in YYYY-MM-DD form. */
  epoch: string
  /** Random 32-byte salt used to derive the per-record content key. */
  salt: Uint8Array
  /** Random 12-byte AES-GCM nonce. */
  nonce: Uint8Array
  /** AES-256-GCM ciphertext including its authentication tag. */
  ciphertext: Uint8Array
  /** CREATE-staked KMS committee epoch controlling release of this content key. Required by version 2. */
  committeeEpoch?: number
  /** Reference to the app.creaton.forum.keyEpoch record containing the threshold-wrapped board key. Required by version 2. */
  keyEpochUri?: string
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain)
}
