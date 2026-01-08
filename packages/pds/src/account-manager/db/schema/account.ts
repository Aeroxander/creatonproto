import { Generated, Selectable } from 'kysely'
import { DatetimeString } from '@atproto/lex'

export interface Account {
  did: string
  email: string | null
  passwordScrypt: string | null
  emailConfirmedAt: DatetimeString | null
  invitesDisabled: Generated<0 | 1>
  evmAddress: string | null
}

export type AccountEntry = Selectable<Account>

export const tableName = 'account'

export type PartialDB = { [tableName]: Account }
