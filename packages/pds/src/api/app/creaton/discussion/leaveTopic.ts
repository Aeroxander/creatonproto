import { AtUri, DidString } from '@atproto/syntax'
import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context'
import { com } from '../../../../lexicons/index.js'
import { prepareDelete } from '../../../../repo'

export default function (server: Server, ctx: AppContext) {
    server.add(com.creaton.discussion.leaveTopic, {
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // User must be authenticated
            },
        }),
        handler: async ({ auth, input }) => {
            const userDid = auth.credentials.did as DidString
            const { topicId } = input.body
            const serviceDid = ctx.cfg.service.did as DidString

            // Build the expected list item URI
            const listItemRkey = `participant-${topicId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}-${userDid.slice(-8)}`
            const listItemUri = `at://${serviceDid}/app.bsky.graph.listitem/${listItemRkey}`

            // Check if the list item exists
            let exists = false
            await ctx.actorStore.read(serviceDid, async (store) => {
                const itemAtUri = new AtUri(listItemUri)
                const record = await store.record.getRecord(itemAtUri, null)
                exists = record !== null
            })

            if (exists) {
                // Delete the list item
                const itemAtUri = new AtUri(listItemUri)
                const listItemDelete = prepareDelete({
                    did: serviceDid,
                    collection: 'app.bsky.graph.listitem',
                    rkey: itemAtUri.rkey,
                })
                await ctx.actorStore.transact(serviceDid, async (actorTxn) => {
                    const commit = await actorTxn.repo.processWrites([listItemDelete])
                    await ctx.sequencer.sequenceCommit(serviceDid, commit)
                    return commit
                })
            }

            return {
                encoding: 'application/json' as const,
                body: {
                    success: true,
                },
            }
        },
    })
}
