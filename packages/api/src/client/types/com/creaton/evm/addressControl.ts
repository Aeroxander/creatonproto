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
const id = 'com.creaton.evm.addressControl'

export interface Main {
  $type: 'com.creaton.evm.addressControl'
  /** 20-byte EVM address controlled by the repo owner. */
  address: Uint8Array
  /** Signature over the SIWE message. */
  signature: Uint8Array
  /** Additional EVM chain IDs where the same address should be treated as linked. */
  alsoOn?: number[]
  siwe: SiweProof
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

/** Structured fields from the SIWE message that was signed. */
export interface SiweProof {
  $type?: 'com.creaton.evm.addressControl#siweProof'
  domain: string
  /** Checksummed 0x-prefixed EVM address. */
  address: string
  statement: string
  uri: string
  version: '1' | (string & {})
  chainId: number
  nonce: string
  issuedAt: string
}

const hashSiweProof = 'siweProof'

export function isSiweProof<V>(v: V) {
  return is$typed(v, id, hashSiweProof)
}

export function validateSiweProof<V>(v: V) {
  return validate<SiweProof & V>(v, id, hashSiweProof)
}
