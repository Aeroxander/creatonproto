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
const id = 'app.creaton.feed.tokenVote'

export interface Main {
  $type: 'app.creaton.feed.tokenVote'
  subject: ComAtprotoRepoStrongRef.Main
  /** 0x-prefixed ETH address for balance check */
  walletAddress: string
  /** ERC-20 contract address */
  tokenContract: string
  /** Token amount as string (for precision) */
  tokenAmount: string
  /** EVM chain ID */
  chainId: number
  /** 1 = upvote, -1 = downvote */
  direction: number
  /** Signature proving wallet ownership */
  signature: Uint8Array
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
