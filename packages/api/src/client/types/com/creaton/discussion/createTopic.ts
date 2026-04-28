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

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.discussion.createTopic'

export type QueryParams = {}

export interface InputSchema {
  /** Unique identifier for this topic (e.g., 'task:42', 'proposal:7'). */
  topicId: string
  /** Human-readable title for the discussion. */
  title: string
  /** Optional description or context. */
  description?: string
}

export interface OutputSchema {
  /** URI of the created topic record. */
  topicUri: string
  /** URI of the participant list. */
  listUri: string
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}
