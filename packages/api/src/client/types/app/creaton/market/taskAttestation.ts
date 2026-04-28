/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@creatonproto/lexicon'
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
const id = 'app.creaton.market.taskAttestation'

export interface Main {
  $type: 'app.creaton.market.taskAttestation'
  task: ComAtprotoRepoStrongRef.Main
  /** The kind of attestation. 'completed' = I verify this is done. 'reviewed' = I reviewed the work. 'contributed' = I helped with this. 'blocked' = this task is blocked by something. */
  type: 'completed' | 'reviewed' | 'contributed' | 'blocked' | (string & {})
  /** Optional short note from the attestor explaining the attestation. */
  body?: string
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
