/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@creatonproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.creaton.market.ipOffer'

export interface Main {
  $type: 'app.creaton.market.ipOffer'
  /** 0x-prefixed keccak256 communityId of the target active conviction market. */
  communityId: string
  /** Short title describing the IP being offered. */
  title: string
  /** Full description of the IP: what it is, why it's relevant to this market, and how it will be used. */
  description: string
  /** Category of the IP being offered. */
  ipType:
    | 'visual_art'
    | 'music'
    | 'code'
    | 'writing'
    | 'brand_asset'
    | 'dataset'
    | 'other'
    | (string & {})
  /** IPFS, Arweave, or ATproto URI pointing to the IP asset or a representative preview. Should be publicly accessible. */
  assetUri: string
  /** License under which the IP is being offered to the market. */
  licenseType?:
    | 'cc_by'
    | 'cc_by_sa'
    | 'cc_by_nc'
    | 'cc_by_nc_sa'
    | 'all_rights_reserved'
    | 'custom'
    | (string & {})
  /** Optional URI to full license terms if licenseType is 'custom'. */
  licenseTermsURI?: string
  /** Basis points (out of the market's full contributorShareBps pool) requested for this IP contribution. For example, if contributorShareBps = 3000 and requestedBps = 500, the IP contributor would receive 5% of the contributor pool. */
  requestedBps: number
  /** 0x-prefixed keccak256 offerId returned by IPContributionRegistry.proposeIPOffer(), once submitted on-chain. */
  onChainOfferId?: string
  /** Current lifecycle status of the IP offer. */
  status:
    | 'draft'
    | 'on_chain_pending'
    | 'dao_voting'
    | 'accepted'
    | 'rejected'
    | 'claimed'
    | (string & {})
  /** ATproto DID of the IP contributor. */
  contributorDid: string
  /** EVM wallet address of the IP contributor. Must match the on-chain proposer address. */
  contributorWallet: string
  /** Optional URI proving original authorship or ownership of the IP (e.g., an on-chain registration, a signed statement, or a prior publication link). */
  provenanceURI?: string
  /** Whether the contributor keeps copyright and licenses the IP to the studio, or intends to assign ownership to the studio or its legal wrapper. */
  rightsModel?: 'contributor_owned' | 'studio_owned' | (string & {})
  /** Whether downstream projects must license directly from the contributor, the studio may sublicense the IP, or the contribution is intended to be assigned to the studio. */
  studioLicenseScope?:
    | 'direct_license_only'
    | 'studio_sublicensable'
    | 'studio_assignment'
    | (string & {})
  /** Contributor share of downstream licensing revenue for this IP, in basis points. */
  contributorRoyaltyBps?: number
  /** Studio DAO treasury share of downstream licensing revenue for this IP, in basis points. */
  studioRoyaltyBps?: number
  /** Legal wrapper or owner type controlling this IP or assignment right. */
  legalEntityType?:
    | 'individual'
    | 'existing_entity'
    | 'studio_unincorporated'
    | 'us_llc'
    | 'wyoming_una'
    | 'wyoming_duna'
    | 'marshall_islands_dao_llc'
    | 'other'
    | (string & {})
  /** Optional legal entity name when the IP owner is an LLC, DAO wrapper, or other organization. */
  ownerEntityName?: string
  /** Optional governing law, arbitration forum, or dispute venue referenced by the contributor's terms. */
  governingLaw?: string
  /** Story Protocol IP Account address for the contributor's registered IP Asset. When provided, the IPContributionRegistry will mint a Story License Token to the market DAO treasury as enforceable proof of the right-to-use upon acceptance. */
  storyIpId?: string
  /** PIL terms ID under which the IP is being licensed to the market. Must have derivativesAllowed=true for the offer to be accepted when Story is enabled. */
  storyLicenseTermsId?: number
  /** The Story License Token ID minted to the market DAO treasury after the offer is accepted. Populated after acceptance. */
  storyLicenseTokenId?: number
  /** Optional domain tags, e.g. ['character-design', 'soundtrack', 'ui-kit']. */
  tags?: string[]
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
