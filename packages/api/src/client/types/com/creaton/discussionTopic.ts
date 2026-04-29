/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import { type $Typed, is$typed as _is$typed, type OmitKey } from '../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.discussionTopic'

export interface Main {
  $type: 'com.creaton.discussionTopic'
  /** Unique identifier for this topic. Typically a chain reference like 'task:42' or 'proposal:7', but can be any string. */
  topicId: string
  /** Human-readable title for this discussion topic. */
  title: string
  /** Optional description or context for the topic. */
  description?: string
  /** URI of the canonical participant list for this topic. */
  listUri: string
  /** DID of the user who created this topic. */
  creator?: string
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
