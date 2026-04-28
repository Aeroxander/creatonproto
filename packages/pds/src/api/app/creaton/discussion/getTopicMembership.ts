import { AtUri } from '@creatonproto/syntax'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'

export default function (server: Server, ctx: AppContext) {
    server.com.creaton.discussion.getTopicMembership({
        auth: ctx.authVerifier.authorization({
            authorize: () => {
                // User must be authenticated
            },
        }),
        handler: async ({ auth, params }) => {
            const userDid = auth.credentials.did
            const { topicId } = params
            const serviceDid = ctx.cfg.service.did

            // Find the topic details
            let listUri: string | undefined = undefined
            await ctx.actorStore.read(serviceDid, async (store) => {
                const records = await store.record.listRecordsForCollection({
                    collection: 'com.creaton.discussionTopic',
                    limit: 100,
                    reverse: false,
                })
                const found = records.find(r => (r.value as any).topicId === topicId)
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

            // Check if user is a participant
            const listItemRkey = `participant-${topicId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}-${userDid.slice(-8)}`
            const listItemUri = `at://${serviceDid}/app.bsky.graph.listitem/${listItemRkey}`
            let isMember = false

            await ctx.actorStore.read(serviceDid, async (store) => {
                const itemAtUri = new AtUri(listItemUri)
                const memberRecord = await store.record.getRecord(itemAtUri, null)
                isMember = memberRecord !== null
            })

            // Count participants by listing listitem records with matching prefix
            let participantCount = 0
            await ctx.actorStore.read(serviceDid, async (store) => {
                const items = await store.record.listRecordsForCollection({
                    collection: 'app.bsky.graph.listitem',
                    limit: 1000,
                    reverse: false,
                })
                // Count items that reference this topic's list
                participantCount = items.filter(
                    r => (r.value as any).list === listUri
                ).length
            })

            return {
                encoding: 'application/json' as const,
                body: {
                    isMember,
                    listUri: listUri,
                    listItemUri: isMember ? listItemUri : undefined,
                    participantCount,
                },
            }
        },
    })
}
