import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../context'
import appBsky from './app/bsky'
import appCreaton from './app/creaton'
import comAtproto from './com/atproto'

export default function (server: Server, ctx: AppContext) {
  comAtproto(server, ctx)
  appBsky(server, ctx)
  appCreaton(server, ctx)
  return server
}

