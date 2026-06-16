/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'
import type * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.forum.topic'

export interface Main {
  $type: 'app.creaton.forum.topic'
  board: ComAtprotoRepoStrongRef.Main
  title: string
  body?: string
  /** Optional external link when this topic is link-style. */
  linkUrl?: string
  flair?: Flair
  tags?: string[]
  productionStage?:
    | 'premise'
    | 'script'
    | 'storyboard'
    | 'animatic'
    | 'production'
    | 'edit'
    | 'release'
    | 'study'
    | (string & {})
  /** Optional linked artifact, pilot, proposal, task, release, or other Creaton object. */
  artifactUri?: string
  /** Denormalized studio URI for backlink discovery when the board belongs to a studio. */
  studioUri?: string
  createdAt: string
  updatedAt?: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}

export interface Flair {
  $type?: 'app.creaton.forum.topic#flair'
  text: string
  backgroundColor?: string
}

const hashFlair = 'flair'

export function isFlair<V>(v: V) {
  return is$typed(v, id, hashFlair)
}

export function validateFlair<V>(v: V) {
  return validate<Flair & V>(v, id, hashFlair)
}
