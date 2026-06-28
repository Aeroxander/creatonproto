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
import type * as AppCreatonForumEncryptedContent from './encryptedContent.js'
import type * as AppCreatonForumEncryptedAttachment from './encryptedAttachment.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.forum.comment'

export interface Main {
  $type: 'app.creaton.forum.comment'
  topic: ComAtprotoRepoStrongRef.Main
  parent?: ComAtprotoRepoStrongRef.Main
  body?: string
  protectedBody?: AppCreatonForumEncryptedContent.Main
  protectedAttachments?: AppCreatonForumEncryptedAttachment.Main[]
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
