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
const id = 'app.creaton.market.taskUpdate'

export interface Main {
  $type: 'app.creaton.market.taskUpdate'
  task: ComAtprotoRepoStrongRef.Main
  /** Set when this update includes a status transition. Omit for comment-only updates. */
  newStatus?:
    | 'open'
    | 'in_progress'
    | 'in_review'
    | 'done'
    | 'cancelled'
    | (string & {})
  /** Set when this update changes the assignee. Omit if unchanged. */
  newAssignee?: string
  /** The update text — explains what changed, what was done, or what is blocked. */
  body: string
  /** AT-URI of the Bluesky post this update was shared to, if the user chose to post publicly. This post is eligible for token-weighted curation in the market feed. */
  blueskyPostUri?: string
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
