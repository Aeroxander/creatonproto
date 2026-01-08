import * as ident from '@creatonproto/syntax'
import { InvalidRequestError } from '@creatonproto/xrpc-server'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.server.createSIWELogin({
    handler: async ({ input }) => {
      let handle: string
      try {
        handle = ident.normalizeAndEnsureValidHandle(input.body.identifier)
      } catch (err) {
        if (err instanceof ident.InvalidHandleError) {
          throw new InvalidRequestError(err.message, 'InvalidHandle')
        } else {
          throw err
        }
      }

      let did: string | undefined
      const user = await ctx.accountManager.getAccount(handle)

      if (user) {
        did = user.did
      } else {
        const supportedHandle = ctx.cfg.identity.serviceHandleDomains.some(
          (host) => {
            return handle.endsWith(host) || handle === host.slice(1)
          },
        )
        // this should be in our DB & we couldn't find it, so fail
        if (supportedHandle) {
          throw new InvalidRequestError('Unable to resolve handle')
        }
      }

      if (!did) {
        did = await ctx.idResolver.handle.resolve(handle)
      }

      if (!did) {
        throw new InvalidRequestError('Unable to resolve handle')
      }

      const siweMessage = await ctx.accountManager.siweLogin(did)
      return {
        encoding: 'application/json',
        body: { siweMessage },
      }
    },
  })
}
