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
const id = 'app.creaton.market.project'

export interface Main {
  $type: 'app.creaton.market.project'
  /** The unique community URI identifying the conviction market. */
  communityUri: string
  /** Public name of the project. */
  name: string
  /** Description of what the project is about. */
  description?: string
  /** Genre classification for discovery. */
  genre?:
    | 'Fantasy'
    | 'Sci-Fi'
    | 'Superhero'
    | 'Horror'
    | 'Romance'
    | 'Other'
    | (string & {})
  /** Type of IP being created. */
  ipType?:
    | 'Character'
    | 'World'
    | 'Story'
    | 'Game IP'
    | 'Music'
    | 'Visual Art'
    | (string & {})
  /** Default license for the project IP. */
  licenseType?: 'CC-BY' | 'CC-BY-SA' | 'All Rights Reserved' | (string & {})
  /** Extended backstory or lore for the IP. */
  loreDescription?: string
  /** URI to cover art (IPFS, Arweave, or HTTPS). */
  coverImageUri?: string
  /** Timestamp of record creation. */
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
