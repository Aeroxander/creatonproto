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
import type * as AppBskyActorDefs from '../../bsky/actor/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.market.getTaskAttestations'

export type QueryParams = {
  /** AT-URI of the task record. */
  taskUri: string
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  attestations: AttestationView[]
  cursor?: string
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

export interface AttestationView {
  $type?: 'app.creaton.market.getTaskAttestations#attestationView'
  uri: string
  cid: string
  author: AppBskyActorDefs.ProfileViewBasic
  /** The raw app.creaton.market.taskAttestation record. */
  record: { [_ in string]: unknown }
  indexedAt: string
}

const hashAttestationView = 'attestationView'

export function isAttestationView<V>(v: V) {
  return is$typed(v, id, hashAttestationView)
}

export function validateAttestationView<V>(v: V) {
  return validate<AttestationView & V>(v, id, hashAttestationView)
}
