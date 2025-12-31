import { FetchHandlerObject } from '@creatonproto/xrpc'

export interface SessionManager extends FetchHandlerObject {
  readonly did?: string
}
