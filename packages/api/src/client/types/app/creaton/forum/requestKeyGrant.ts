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
const id = 'app.creaton.forum.requestKeyGrant'

export type QueryParams = {}

export interface InputSchema {
  boardUri: string
  certificate: SessionCertificate
}

export interface OutputSchema {
  grants: Grant[]
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

export class ProtectedBoardNotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class WrongIssuerError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class PaymentFailedError extends XRPCError {
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
    if (e.error === 'ProtectedBoardNotFound')
      return new ProtectedBoardNotFoundError(e)
    if (e.error === 'WrongIssuer') return new WrongIssuerError(e)
    if (e.error === 'PaymentFailed') return new PaymentFailedError(e)
    if (e.error === 'InvalidAccessCertificate')
      return new InvalidAccessCertificateError(e)
  }

  return e
}

export interface SessionCertificate {
  $type?: 'app.creaton.forum.requestKeyGrant#sessionCertificate'
  version: '1' | (string & {})
  did: string
  account: string
  boardUri: string
  issuer: string
  /** Base64url uncompressed P-256 HPKE public key. */
  publicKey: string
  /** Base64url SHA-256 fingerprint. */
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

export interface Grant {
  $type?: 'app.creaton.forum.requestKeyGrant#grant'
  grantId: string
  boardUri: string
  sessionKeyHash: string
  certificateHash: string
  epochFrom: string
  epochTo: string
  expiresAt: string
  version: number
  suite: 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM' | (string & {})
  enc: string
  ciphertext: string
  keyCommitment: string
  createdAt: string
}

const hashGrant = 'grant'

export function isGrant<V>(v: V) {
  return is$typed(v, id, hashGrant)
}

export function validateGrant<V>(v: V) {
  return validate<Grant & V>(v, id, hashGrant)
}
