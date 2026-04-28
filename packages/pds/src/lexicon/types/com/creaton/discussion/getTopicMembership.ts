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
const id = 'com.creaton.discussion.getTopicMembership'

export type QueryParams = {
  /** The topic identifier (e.g., 'task:42'). */
  topicId: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** Whether the user is a participant in this topic. */
  isMember: boolean
  /** URI of the topic's participant list, if it exists. */
  listUri?: string
  /** URI of the user's list item record, if a participant. */
  listItemUri?: string
  /** Number of participants in the topic. */
  participantCount?: number
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
