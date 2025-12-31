import { LexiconDocument } from '@creatonproto/lex-document'

export type { LexiconDocument }

export type LexiconData = {
  createdAt: Date
  updatedAt: Date
  lastSucceededAt: null | Date
  uri: null | string
  lexicon: null | LexiconDocument
}
