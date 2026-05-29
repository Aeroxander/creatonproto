/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import { type $Typed, is$typed as _is$typed, type OmitKey } from '../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.proposal'

export interface Main {
  $type: 'com.creaton.proposal'
  /** Short title for the proposal. */
  title: string
  /** Detailed description of what's being proposed, scope, deliverables, etc. */
  description?: string
  /** If this proposal originated from a discussion, the topic ID (e.g., 'task:42' or 'discussion:...'). */
  discussionTopicUri?: string
  /** Creative production stage this proposal belongs to. */
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
  /** Primary artifact this proposal expects to create, review, or improve. */
  artifactType?:
    | 'brief'
    | 'script'
    | 'storyboard'
    | 'animatic'
    | 'scene'
    | 'edit'
    | 'pilot'
    | 'release'
    | 'feedback_report'
    | (string & {})
  /** Optional artifact, discussion, task, pilot, or release URI this proposal is responding to. */
  feedbackTargetUri?: string
  /** Optional disclosure of AI tools, models, or generated material involved in the work. */
  aiAssistDisclosure?: string
  /** Requested budget as a string (to preserve BigInt precision). '0' means equity-only. */
  budget?: string
  /** Requested ProjectToken allocation in basis points. */
  tokenWeightBps?: number
  /** Claim deadline in days from creation. */
  deadlineDays?: number
  createdAt: string
  review?: ReviewContract
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

/** Review configuration for accepting or disputing a proposed task. */
export interface ReviewContract {
  $type?: 'com.creaton.proposal#reviewContract'
  /** Specific conditions that must be met for the proposal deliverables to be considered accepted. */
  acceptanceCriteria: string[]
  /** Types of proof or documentation the contributor must provide, such as screenshots, test results, external links, or ATProto records. */
  evidenceRequired: string[]
  /** Guidance for reviewers on how to evaluate the submission, including quality standards or review process details. */
  reviewerExpectations?: string
  /** How to escalate a review disagreement, such as a DAO vote link, arbitrator DID, or dispute topic URI. */
  disputePath?: string
}

const hashReviewContract = 'reviewContract'

export function isReviewContract<V>(v: V) {
  return is$typed(v, id, hashReviewContract)
}

export function validateReviewContract<V>(v: V) {
  return validate<ReviewContract & V>(v, id, hashReviewContract)
}
