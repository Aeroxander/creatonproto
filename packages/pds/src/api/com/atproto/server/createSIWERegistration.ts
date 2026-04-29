import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.server.createSIWERegistration, {
    handler: async ({ input }) => {
      const siweMessage = await ctx.accountManager.siweRegistration(
        input.body.evmAddress,
      )
      return {
        encoding: 'application/json',
        body: { siweMessage },
      }
    },
  })
}
