/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@creatonproto/xrpc'
import { type ValidationResult, BlobRef } from '@creatonproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'
import type * as AppBskyActorDefs from '../../bsky/actor/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.feed.getTokenVotes'

export type QueryParams = {
  /** AT-URI of the subject (eg, a post record). */
  uri: string
  /** CID of the subject record. */
  cid?: string
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  uri: string
  cid?: string
  cursor?: string
  /** Sum of decay-weighted upvotes */
  upvoteWeight: string
  /** Sum of decay-weighted downvotes */
  downvoteWeight: string
  votes: Vote[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}

export interface Vote {
  $type?: 'app.creaton.feed.getTokenVotes#vote'
  indexedAt: string
  createdAt: string
  actor: AppBskyActorDefs.ProfileView
  tokenContract: string
  claimedAmount: string
  effectiveWeight: string
  direction: number
}

const hashVote = 'vote'

export function isVote<V>(v: V) {
  return is$typed(v, id, hashVote)
}

export function validateVote<V>(v: V) {
  return validate<Vote & V>(v, id, hashVote)
}
