/**
 * GENERATED CODE - DO NOT MODIFY
 */
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

export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
}

export type HandlerOutput = HandlerError | HandlerSuccess
