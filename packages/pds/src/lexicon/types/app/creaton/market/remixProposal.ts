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
const id = 'app.creaton.market.remixProposal'

export interface Main {
  $type: 'app.creaton.market.remixProposal'
  /** 0x-prefixed keccak256 communityId of the completed parent conviction market. */
  parentCommunityId: string
  /** 0x-prefixed keccak256 communityId for the proposed remix conviction market. */
  remixCommunityId: string
  /** Short title of the remix project. */
  title: string
  /** Full description of the remix: what it is, how it builds on the parent IP, and what the remix team will deliver. */
  description: string
  /** Explanation of how the new work derives from or incorporates the parent project's IP. Should reference the specific assets (characters, music, code modules, etc.) being built upon. */
  ipLineage: string
  /** License under which the remix output will be released. */
  licenseType?:
    | 'cc_by'
    | 'cc_by_sa'
    | 'cc_by_nc'
    | 'cc_by_nc_sa'
    | 'all_rights_reserved'
    | 'custom'
    | (string & {})
  /** Proposed milestones for the remix project. */
  milestones?: Milestone[]
  /** Absolute number of parent project tokens requested (as a decimal string to avoid integer overflow). */
  requestedTokens: string
  /** Basis points (out of 10 000) of the token allocation that goes to the remix contributors via TrustGraph. The remainder goes to remix funders. */
  remixContributorShareBps: number
  /** 0x-prefixed keccak256 remixId returned by RemixMarketFactory.submitRemixProposal(), once the proposal has been submitted on-chain. */
  onChainRemixId?: string
  /** Current lifecycle status of the remix proposal. */
  status:
    | 'draft'
    | 'on_chain_pending'
    | 'parent_dao_voting'
    | 'approved'
    | 'active'
    | 'complete'
    | 'rejected'
    | (string & {})
  /** ATproto DID of the remix proposer. */
  proposerDid: string
  /** EVM wallet address of the remix proposer. Must match the on-chain proposer. */
  proposerWallet: string
  /** Address of the inner Majeur DAO deployed after parent DAO approval. */
  innerDAOAddress?: string
  /** Canonical ATproto or IPFS URI for the on-chain metadataURI passed to RemixMarketFactory. */
  metadataURI?: string
  /** Story Protocol IP Account address of the remix creative work. Populated once the proposer has registered the remix NFT on Story Protocol. Enables on-chain derivative registration and PIL-governed royalty flows. */
  storyIpId?: string
  /** Story Protocol IP Account address of the parent conviction market's IP. Populated from StoryIPAdapter.communityIpId(parentCommunityId). */
  storyParentIpId?: string
  /** PIL terms ID from the parent IP used to register this remix as a derivative on Story Protocol. */
  storyLicenseTermsId?: number
  /** Optional genre or domain tags, e.g. ['animation', 'music', 'sequel']. */
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

/** A proposed milestone for the remix project. */
export interface Milestone {
  $type?: 'app.creaton.market.remixProposal#milestone'
  title: string
  description: string
  /** Rough estimate of weeks to complete this milestone. */
  estimatedWeeks?: number
}

const hashMilestone = 'milestone'

export function isMilestone<V>(v: V) {
  return is$typed(v, id, hashMilestone)
}

export function validateMilestone<V>(v: V) {
  return validate<Milestone & V>(v, id, hashMilestone)
}
