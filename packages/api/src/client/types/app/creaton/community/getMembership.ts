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
const id = 'app.creaton.community.getMembership'

export type QueryParams = {
  /** The Ethereum address of the DAO/community */
  daoAddress: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** Whether the user is a member of this community */
  isMember: boolean
  /** URI of the community list, if it exists */
  listUri?: string
  /** URI of the user's list item record, if member */
  listItemUri?: string
  /** Number of members in the community */
  memberCount?: number
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
