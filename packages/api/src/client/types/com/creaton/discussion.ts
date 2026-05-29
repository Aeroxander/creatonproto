/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import { type $Typed, is$typed as _is$typed, type OmitKey } from '../../../util'
import type * as AppBskyRichtextFacet from '../../app/bsky/richtext/facet.js'
import type * as ComAtprotoRepoStrongRef from '../atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.creaton.discussion'

export interface Main {
  $type: 'com.creaton.discussion'
  /** The discussion post text. Supports plain text or markdown. */
  body: string
  reply?: ReplyRef
  topic?: TopicRef
  /** Mentions of other users in the body text. */
  mentions?: AppBskyRichtextFacet.Mention[]
  /** Timestamp when this post was created. */
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

/** Reference to parent and root posts for threading. */
export interface ReplyRef {
  $type?: 'com.creaton.discussion#replyRef'
  root: ComAtprotoRepoStrongRef.Main
  parent: ComAtprotoRepoStrongRef.Main
}

const hashReplyRef = 'replyRef'

export function isReplyRef<V>(v: V) {
  return is$typed(v, id, hashReplyRef)
}

export function validateReplyRef<V>(v: V) {
  return validate<ReplyRef & V>(v, id, hashReplyRef)
}

/** Reference to the topic this discussion belongs to. */
export interface TopicRef {
  $type?: 'com.creaton.discussion#topicRef'
  /** Identifier for the topic. Can be an at:// URI (for linking to an ATProto record), an on-chain reference (e.g., 'chain:1:0xabc...:42' for taskId 42), or a plain string identifier. */
  uri: string
  /** Optional human-readable label for the topic (e.g., task title). */
  label?: string
}

const hashTopicRef = 'topicRef'

export function isTopicRef<V>(v: V) {
  return is$typed(v, id, hashTopicRef)
}

export function validateTopicRef<V>(v: V) {
  return validate<TopicRef & V>(v, id, hashTopicRef)
}
