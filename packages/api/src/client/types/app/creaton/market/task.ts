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
const id = 'app.creaton.market.task'

export interface Main {
  $type: 'app.creaton.market.task'
  /** The 0x-prefixed keccak256 communityId of the conviction market. */
  communityId: string
  /** Zero-based milestone index this task belongs to. Use -1 for backlog (not yet assigned to a milestone). */
  milestoneIdx: number
  title: string
  /** Optional rich-text body describing the task in detail. */
  description?: string
  status:
    | 'open'
    | 'in_progress'
    | 'in_review'
    | 'done'
    | 'cancelled'
    | (string & {})
  /** DID of the assigned contributor. Optional — any DID may self-assign via a taskUpdate. */
  assignee?: string
  /** Optional labels, e.g. ['design', 'research', 'engineering']. */
  tags?: string[]
  /** Set to true by the market creator to mark this task as canonical. Informs contributors that work on this task counts toward the milestone. */
  accepted?: boolean
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
