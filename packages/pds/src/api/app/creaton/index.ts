import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../context'
import community from './community'

export default function (server: Server, ctx: AppContext) {
  community(server, ctx)
}
