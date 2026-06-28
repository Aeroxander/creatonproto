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
const id = 'app.creaton.forum.getRelatedTopics'

export type QueryParams = {
  topicUri: string
  limit?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  topics: RelatedTopic[]
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

export interface RelatedTopic {
  $type?: 'app.creaton.forum.getRelatedTopics#relatedTopic'
  uri: string
  title: string
  boardUri: string
  /** JSON number between -1 and 1. */
  similarity: { [_ in string]: unknown }
}

const hashRelatedTopic = 'relatedTopic'

export function isRelatedTopic<V>(v: V) {
  return is$typed(v, id, hashRelatedTopic)
}

export function validateRelatedTopic<V>(v: V) {
  return validate<RelatedTopic & V>(v, id, hashRelatedTopic)
}
