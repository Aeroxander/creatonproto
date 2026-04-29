import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context'
import create from './create'
import join from './join'
import leave from './leave'
import getMembership from './getMembership'

export default function (server: Server, ctx: AppContext) {
    create(server, ctx)
    join(server, ctx)
    leave(server, ctx)
    getMembership(server, ctx)
}
