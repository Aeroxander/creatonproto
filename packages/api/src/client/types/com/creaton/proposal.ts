/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import { type $Typed, is$typed as _is$typed, type OmitKey } from '../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.proposal'

export interface Main {
  $type: 'com.creaton.proposal'
  /** Short title for the proposal. */
  title: string
  /** Detailed description of what's being proposed, scope, deliverables, etc. */
  description?: string
  /** If this proposal originated from a discussion, the topic ID (e.g., 'task:42' or 'discussion:...'). */
  discussionTopicUri?: string
  /** Requested budget as a string (to preserve BigInt precision). '0' means equity-only. */
  budget?: string
  /** Requested ProjectToken allocation in basis points. */
  tokenWeightBps?: number
  /** Claim deadline in days from creation. */
  deadlineDays?: number
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
