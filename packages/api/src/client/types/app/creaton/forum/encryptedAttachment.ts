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
const id = 'app.creaton.forum.encryptedAttachment'

/** A Logos-hosted encrypted attachment whose file key is wrapped by a board epoch key. */
export interface Main {
  $type?: 'app.creaton.forum.encryptedAttachment'
  version: number
  suite: 'AES-256-GCM+HKDF-SHA256/AES-256-GCM' | (string & {})
  epoch: string
  keyEpochUri: string
  /** Content-addressed Logos manifest for encrypted chunks. */
  manifestUri: string
  ciphertextHash: Uint8Array
  size: number
  mediaType?: string
  name?: string
  fileNonce: Uint8Array
  keyNonce: Uint8Array
  wrappedFileKey: Uint8Array
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain)
}
