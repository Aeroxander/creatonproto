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
const id = 'app.creaton.forum.searchForum'

export type QueryParams = {
  query: string
  limit?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  results: SearchHit[]
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

export interface SearchHit {
  $type?: 'app.creaton.forum.searchForum#searchHit'
  uri: string
  kind: 'topic' | 'comment' | (string & {})
  title?: string
  body: string
  boardUri?: string
  authorDid: string
  createdAt: string
  /** JSON number containing cosine similarity. */
  score: { [_ in string]: unknown }
}

const hashSearchHit = 'searchHit'

export function isSearchHit<V>(v: V) {
  return is$typed(v, id, hashSearchHit)
}

export function validateSearchHit<V>(v: V) {
  return validate<SearchHit & V>(v, id, hashSearchHit)
}
