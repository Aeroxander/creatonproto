/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import { type $Typed, is$typed as _is$typed, type OmitKey } from '../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.studioLearning'

export interface Main {
  $type: 'com.creaton.studioLearning'
  /** Learning record category. */
  kind: 'decision' | 'retrospective' | 'root_cause' | 'playbook' | (string & {})
  /** Studio or market community URI. */
  communityUri: string
  /** Optional linked discussion topic id. */
  topicId?: string
  /** Creative production stage this learning applies to. */
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
  /** Short title. */
  title: string
  /** Summary of the decision, observation, or lesson. */
  body: string
  /** Decision, standard, or action chosen. */
  decision?: string
  /** Root cause when applicable. */
  rootCause?: string
  /** Corrective action or process improvement. */
  correctiveAction?: string
  /** Related metric or signal. */
  metric?: string
  /** Audience, funder, or crew signals studied before the decision. */
  studySignals?: string[]
  /** Next Plan-Do-Study-Act experiment. */
  nextExperiment?: string
  /** Linked artifacts, tasks, discussions, or proposals. */
  linkedUris?: string[]
  createdBy?: string
  createdAt: string
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
