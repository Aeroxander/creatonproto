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
const id = 'app.creaton.forum.requestKeyRelease'

export type QueryParams = {}

export interface InputSchema {
  boardUri: string
  epochFrom: string
  epochTo: string
  committeeEpoch: number
  /** Finalized Abstract block number encoded as a base-10 string. */
  eligibilityBlock: string
  certificate: SessionCertificate
}

export interface OutputSchema {
  receipt: AccessReceipt
  shares: PartialShare[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class AuthenticationRequiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class IdentityMismatchError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class EntitlementRequiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class PaymentFailedError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class PolicyMismatchError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class CommitteeUnavailableError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class InvalidAccessCertificateError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'AuthenticationRequired')
      return new AuthenticationRequiredError(e)
    if (e.error === 'IdentityMismatch') return new IdentityMismatchError(e)
    if (e.error === 'EntitlementRequired')
      return new EntitlementRequiredError(e)
    if (e.error === 'PaymentFailed') return new PaymentFailedError(e)
    if (e.error === 'PolicyMismatch') return new PolicyMismatchError(e)
    if (e.error === 'CommitteeUnavailable')
      return new CommitteeUnavailableError(e)
    if (e.error === 'InvalidAccessCertificate')
      return new InvalidAccessCertificateError(e)
  }

  return e
}

export interface SessionCertificate {
  $type?: 'app.creaton.forum.requestKeyRelease#sessionCertificate'
  version: '1' | (string & {})
  did: string
  account: string
  boardUri: string
  issuer: string
  publicKey: string
  sessionKeyHash: string
  nonce: string
  issuedAt: number
  expiresAt: number
  signature: string
}

const hashSessionCertificate = 'sessionCertificate'

export function isSessionCertificate<V>(v: V) {
  return is$typed(v, id, hashSessionCertificate)
}

export function validateSessionCertificate<V>(v: V) {
  return validate<SessionCertificate & V>(v, id, hashSessionCertificate)
}

export interface AccessReceipt {
  $type?: 'app.creaton.forum.requestKeyRelease#accessReceipt'
  requestId: string
  requestHash: string
  boardUri: string
  subjectHash: string
  committeeEpoch: number
  eligibilityBlock: string
  policyHash: string
  expiresAt: string
}

const hashAccessReceipt = 'accessReceipt'

export function isAccessReceipt<V>(v: V) {
  return is$typed(v, id, hashAccessReceipt)
}

export function validateAccessReceipt<V>(v: V) {
  return validate<AccessReceipt & V>(v, id, hashAccessReceipt)
}

export interface PartialShare {
  $type?: 'app.creaton.forum.requestKeyRelease#partialShare'
  version: number
  suite: 'BLS12-381-THRESHOLD-KEM-HPKE-P256' | (string & {})
  requestHash: string
  committeeEpoch: number
  operatorId: string
  shareIndex: number
  recipientKeyHash: string
  envelope: TransportEnvelope
  shareProof: string
  operatorSignature: string
}

const hashPartialShare = 'partialShare'

export function isPartialShare<V>(v: V) {
  return is$typed(v, id, hashPartialShare)
}

export function validatePartialShare<V>(v: V) {
  return validate<PartialShare & V>(v, id, hashPartialShare)
}

export interface TransportEnvelope {
  $type?: 'app.creaton.forum.requestKeyRelease#transportEnvelope'
  version: number
  suite: 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM' | (string & {})
  enc: string
  ciphertext: string
}

const hashTransportEnvelope = 'transportEnvelope'

export function isTransportEnvelope<V>(v: V) {
  return is$typed(v, id, hashTransportEnvelope)
}

export function validateTransportEnvelope<V>(v: V) {
  return validate<TransportEnvelope & V>(v, id, hashTransportEnvelope)
}
