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

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.forum.board'

export interface Main {
  $type: 'app.creaton.forum.board'
  title: string
  description?: string
  /** Optional client-friendly board slug. Clients should not treat it as globally unique. */
  slug?: string
  /** Optional shared discovery target URI for directory-style board discovery. */
  directoryUri?: string
  /** Whether this board is attached to a studio or independent. */
  scope: 'studio' | 'standalone' | (string & {})
  /** Studio, market, or community URI when scope is studio. Omitted for standalone boards. */
  studioUri?: string
  rules?: string
  access?: AccessPolicy
  avatar?: BlobRef
  banner?: BlobRef
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

export interface AccessPolicy {
  $type?: 'app.creaton.forum.board#accessPolicy'
  kind: 'protected' | (string & {})
  issuerDid: string
  issuerEndpoint: string
  chainId: number
  asset: string
  /** Atomic ERC-3009 payment amount as a base-10 integer string. */
  amount: string
  durationSeconds: number
  payTo: string
  paymentProtocol: 'mpp-abstract-charge' | (string & {})
  revenueRouter: string
  committeeRegistry: string
  entitlementRegistry: string
  committeeSize: number
  committeeThreshold: number
  historyPolicy: 'full' | 'window' | 'forward' | (string & {})
  epochSeconds: number
}

const hashAccessPolicy = 'accessPolicy'

export function isAccessPolicy<V>(v: V) {
  return is$typed(v, id, hashAccessPolicy)
}

export function validateAccessPolicy<V>(v: V) {
  return validate<AccessPolicy & V>(v, id, hashAccessPolicy)
}
