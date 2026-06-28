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
const id = 'app.creaton.forum.keyEpoch'

export interface Main {
  $type: 'app.creaton.forum.keyEpoch'
  board: ComAtprotoRepoStrongRef.Main
  /** UTC key epoch in YYYY-MM-DD form. */
  epoch: string
  committeeEpoch: number
  version: number
  suite: 'BLS12-381-THRESHOLD-KEM/AES-256-GCM' | (string & {})
  /** Threshold KEM encapsulation under the committee public key. */
  encapsulation: Uint8Array
  /** Random 12-byte nonce for the wrapped epoch-key ciphertext. */
  nonce: Uint8Array
  /** Authenticated ciphertext containing the 32-byte board epoch key. */
  ciphertext: Uint8Array
  /** SHA-256 commitment to the plaintext board epoch key. */
  keyCommitment: Uint8Array
  /** Hash of the board access policy used when this key was created. */
  policyHash: Uint8Array
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
