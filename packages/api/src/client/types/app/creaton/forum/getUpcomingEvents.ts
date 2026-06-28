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
const id = 'app.creaton.forum.getUpcomingEvents'

export type QueryParams = {
  viewerDid?: string
  boardUri?: string
  boardUris?: string[]
  limit?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  events: UpcomingEvent[]
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

export interface UpcomingEvent {
  $type?: 'app.creaton.forum.getUpcomingEvents#upcomingEvent'
  uri: string
  name: string
  startsAt: string
  endsAt?: string
  boardUri?: string
  boardTitle?: string
  authorDid: string
  mode?: string
  status?: string
  goingCount?: number
  interestedCount?: number
  viewerRsvp?: 'going' | 'interested' | 'notgoing' | (string & {})
}

const hashUpcomingEvent = 'upcomingEvent'

export function isUpcomingEvent<V>(v: V) {
  return is$typed(v, id, hashUpcomingEvent)
}

export function validateUpcomingEvent<V>(v: V) {
  return validate<UpcomingEvent & V>(v, id, hashUpcomingEvent)
}
