import { AtUri } from '@creatonproto/syntax'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'

export default function (server: Server, ctx: AppContext) {
    server.app.creaton.community.getMembership({
        auth: ctx.authVerifier.authorization({
            authorize: () => {
                // Basic auth check - user must be authenticated
            },
        }),
        handler: async ({ auth, params }) => {
            const userDid = auth.credentials.did
            const { daoAddress } = params
            const serviceDid = ctx.cfg.service.did

            // Normalize DAO address to lowercase
            const normalizedDao = daoAddress.toLowerCase()

            // 1. Find the canonical community details in PDS repo
            let listUri: string | undefined = undefined
            await ctx.actorStore.read(serviceDid, async (store) => {
                const records = await store.record.listRecordsForCollection({
                    collection: 'app.creaton.community.details',
                    limit: 100,
                    reverse: false
                })
                const found = records.find(r => (r.value as any).daoAddress.toLowerCase() === normalizedDao)
                if (found) {
                    listUri = (found.value as any).listUri
                }
            })

            if (!listUri) {
                return {
                    encoding: 'application/json' as const,
                    body: {
                        isMember: false,
                    },
                }
            }

            // 2. Check if the user is a member in the PDS repo
            const listItemRkey = `member-${normalizedDao.slice(2, 10)}-${userDid.slice(-8)}`
            const listItemUri = `at://${serviceDid}/app.bsky.graph.listitem/${listItemRkey}`
            let isMember = false

            await ctx.actorStore.read(serviceDid, async (store) => {
                const itemAtUri = new AtUri(listItemUri)
                const memberRecord = await store.record.getRecord(itemAtUri, null)
                isMember = memberRecord !== null
            })

            return {
                encoding: 'application/json' as const,
                body: {
                    isMember,
                    listUri: listUri,
                    listItemUri: isMember ? listItemUri : undefined,
                },
            }
        },
    })
}
