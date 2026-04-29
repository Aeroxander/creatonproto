import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../context'
import community from './community'
import discussion from './discussion'

export default function (server: Server, ctx: AppContext) {
    community(server, ctx)
    discussion(server, ctx)
}
