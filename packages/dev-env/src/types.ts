import * as bsky from '@creatonproto/bsky'
import * as bsync from '@creatonproto/bsync'
import { ExportableKeypair, Keypair } from '@creatonproto/crypto'
import * as ozone from '@creatonproto/ozone'
import * as pds from '@creatonproto/pds'

export type IntrospectConfig = {
  port?: number
}

export type PlcConfig = {
  port?: number
  version?: string
}

export type PdsConfig = Partial<pds.ServerEnvironment> & {
  didPlcUrl: string
  migration?: string
}

export type BskyConfig = Partial<bsky.ServerConfig> & {
  plcUrl: string
  repoProvider: string
  dbPostgresUrl: string
  dbPostgresSchema: string
  redisHost: string
  pdsPort: number
  migration?: string
  privateKey?: string
}

export type BsyncConfig = Partial<bsync.ServerEnvironment> & {
  dbUrl: string
}

export type OzoneConfig = Partial<ozone.OzoneEnvironment> & {
  plcUrl: string
  appviewUrl: string
  appviewDid: string
  dbPostgresUrl: string
  migration?: string
  signingKey?: ExportableKeypair
  imgInvalidator?: ozone.ImageInvalidator
}

export type TapConfig = {
  enabled?: boolean
  port?: number
}

export type TokenVoteConfig = {
  enabled?: boolean
  port?: number
}

export type TestServerParams = {
  dbPostgresUrl: string
  dbPostgresSchema: string
  pds: Partial<PdsConfig>
  plc: Partial<PlcConfig>
  bsky: Partial<BskyConfig>
  ozone: Partial<OzoneConfig>
  introspect: Partial<IntrospectConfig>
  tap: Partial<TapConfig>
  tokenVote: Partial<TokenVoteConfig>
}

export type DidAndKey = {
  did: string
  key: Keypair
}
