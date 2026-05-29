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
  /** Default studio rights posture for project IP. */
  creatorRights?:
    | 'creator_retained'
    | 'studio_license'
    | 'studio_assignment'
    | (string & {})
  /** Whether the project IP is ready for or already connected to Story Protocol. */
  storyStatus?:
    | 'not_registered'
    | 'ready_to_register'
    | 'registered'
    | (string & {})
  /** Optional Story IP Account address or identifier. */
  storyIpId?: string
  /** Optional Story PIL terms identifier or URI. */
  storyLicenseTermsId?: string
  /** Intended high-level royalty routing policy. */
  royaltyPlan?:
    | 'creator_weighted'
    | 'studio_treasury'
    | 'manual_split'
    | (string & {})
  /** How the studio expects to introduce apptokens. */
  apptokenLaunch?:
    | 'membership_auction'
    | 'production_token'
    | 'later'
    | (string & {})
  /** Cadence for recurring producer or patron auctions. */
  membershipCadence?: 'weekly' | 'seasonal' | 'manual' | (string & {})
  /** High-level sales mechanism for early patron receipts and token demand discovery. */
  patronSaleModel?:
    | 'weekly_patron_auction'
    | 'long_term_cca'
    | 'weekly_cca_epochs'
    | 'final_cca_only'
    | (string & {})
  /** How early patron receipts should be weighted for future bounded allocation or reward eligibility. */
  patronRewardModel?:
    | 'time_weighted_conviction'
    | 'participation_weighted'
    | 'flat_membership'
    | (string & {})
  /** Condition expected before public apptoken liquidity launches. */
  finalLaunchTrigger?:
    | 'proof_plus_final_cca'
    | 'dao_vote'
    | 'manual_later'
    | (string & {})
  /** How the project expects to operate: solo creator, creator-led studio, or full DAO studio. */
  operationMode?:
    | 'solo_creator'
    | 'creator_led_studio'
    | 'dao_studio'
    | (string & {})
  /** What early fans receive before any legally reviewed royalty or token launch. */
  fanUpsideModel?:
    | 'patron_receipts'
    | 'producer_pass'
    | 'optional_royalty_pool'
    | 'access_only'
    | (string & {})
  /** How patron or market capital should unlock as the creator ships work. */
  capitalReleaseModel?:
    | 'verified_drops'
    | 'milestone_escrow'
    | 'manual_creator'
    | (string & {})
  /** Optional wallet or treasury address expected to receive Superfluid patron streams. */
  patronStreamRecipient?: string
  /** Optional Superfluid Super Token address used for recurring patron streams. */
  patronSuperTokenAddress?: string
  /** Network name or chain id for recurring patron streams. */
  patronStreamNetwork?: string
  /** Suggested monthly patron support amount, stored as display text until stream execution is wired. */
  suggestedMonthlySupport?: string
  /** Optional customized production stage ids for this studio. Clients use the default media-production spine when absent. */
  productionStages?: (
    | 'premise'
    | 'script'
    | 'storyboard'
    | 'animatic'
    | 'production'
    | 'edit'
    | 'release'
    | 'study'
    | (string & {})
  )[]
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
