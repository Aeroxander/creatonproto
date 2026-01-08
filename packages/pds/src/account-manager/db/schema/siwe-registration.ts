import { Selectable } from 'kysely'

export interface SIWERegistration {
  evmAddress: string
  createdAt: string
  siweMessage: string
}

export type SiweRegistrationEntry = Selectable<SIWERegistration>

export const tableName = 'siwe_registration'

export type PartialDB = { [tableName]: SIWERegistration }
