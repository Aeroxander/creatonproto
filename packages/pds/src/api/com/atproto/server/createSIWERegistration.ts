import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.server.createSIWERegistration({
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
