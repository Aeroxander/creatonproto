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
const id = 'app.creaton.market.getTasks'

export type QueryParams = {
  /** The 0x-prefixed keccak256 communityId of the conviction market. */
  communityId: string
  /** When provided, only return tasks for this milestone index. Pass -1 to fetch backlog tasks. */
  milestoneIdx?: number
  /** When provided, filter by task status. */
  status?:
    | 'open'
    | 'in_progress'
    | 'in_review'
    | 'done'
    | 'cancelled'
    | (string & {})
  /** When provided, only return tasks created by this DID. */
  authorDid?: string
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  tasks: TaskView[]
  cursor?: string
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

export interface TaskView {
  $type?: 'app.creaton.market.getTasks#taskView'
  uri: string
  cid: string
  author: AppBskyActorDefs.ProfileViewBasic
  /** The raw app.creaton.market.task record. */
  record: { [_ in string]: unknown }
  assigneeProfile?: AppBskyActorDefs.ProfileViewBasic
  /** Total number of social attestations on this task. */
  attestationCount: number
  viewerAttestation?: ViewerAttestation
  indexedAt: string
}

const hashTaskView = 'taskView'

export function isTaskView<V>(v: V) {
  return is$typed(v, id, hashTaskView)
}

export function validateTaskView<V>(v: V) {
  return validate<TaskView & V>(v, id, hashTaskView)
}

export interface ViewerAttestation {
  $type?: 'app.creaton.market.getTasks#viewerAttestation'
  uri: string
  type: 'completed' | 'reviewed' | 'contributed' | 'blocked' | (string & {})
}

const hashViewerAttestation = 'viewerAttestation'

export function isViewerAttestation<V>(v: V) {
  return is$typed(v, id, hashViewerAttestation)
}

export function validateViewerAttestation<V>(v: V) {
  return validate<ViewerAttestation & V>(v, id, hashViewerAttestation)
}
