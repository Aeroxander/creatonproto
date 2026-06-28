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
const id = 'app.creaton.forum.getNetworkBoards'

export type QueryParams = {
  viewerDid: string
  limit?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  boards: BoardHint[]
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

export interface BoardHint {
  $type?: 'app.creaton.forum.getNetworkBoards#boardHint'
  boardUri: string
  title: string
  description?: string
  networkActivity: number
}

const hashBoardHint = 'boardHint'

export function isBoardHint<V>(v: V) {
  return is$typed(v, id, hashBoardHint)
}

export function validateBoardHint<V>(v: V) {
  return validate<BoardHint & V>(v, id, hashBoardHint)
}
