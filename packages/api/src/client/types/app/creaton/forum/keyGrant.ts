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
import type * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.forum.keyGrant'

export interface Main {
  $type: 'app.creaton.forum.keyGrant'
  board: ComAtprotoRepoStrongRef.Main
  /** Opaque, issuer-generated identifier; it must not encode a DID or wallet address. */
  grantId: string
  /** SHA-256 fingerprint of the temporary HPKE public key. */
  sessionKeyHash: Uint8Array
  /** SHA-256 hash of the AGW-signed access-session certificate. */
  certificateHash: Uint8Array
  epochFrom: string
  epochTo: string
  expiresAt: string
  version: number
  suite: 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM' | (string & {})
  /** RFC 9180 encapsulated key. */
  enc: Uint8Array
  /** HPKE ciphertext containing at most 256 daily epoch keys. */
  ciphertext: Uint8Array
  /** SHA-256 commitment to the canonical plaintext epoch-key bundle. */
  keyCommitment: Uint8Array
  createdAt: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}
