/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
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
const id = 'app.creaton.forum.getUserKarma'

export type QueryParams = {
  did: string
}
export type InputSchema = undefined

export interface OutputSchema {
  did: string
  /** JSON number containing the PageRank-weighted post score. */
  postKarma: { [_ in string]: unknown }
  /** JSON number containing the PageRank-weighted comment score. */
  commentKarma: { [_ in string]: unknown }
  /** JSON number containing the combined PageRank-weighted score. */
  totalKarma: { [_ in string]: unknown }
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
