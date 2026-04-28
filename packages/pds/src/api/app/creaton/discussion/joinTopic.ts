import { AtUri } from '@creatonproto/syntax'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { prepareCreate } from '../../../../repo'
import { InvalidRequestError } from '@creatonproto/xrpc-server'

export default function (server: Server, ctx: AppContext) {
    server.com.creaton.discussion.joinTopic({
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // User must be authenticated
            },
        }),
        handler: async ({ auth, input }) => {
            const userDid = auth.credentials.did
            const { topicId } = input.body
            const serviceDid = ctx.cfg.service.did

            // Find the topic details
            let listUri: string | null = null
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
                throw new InvalidRequestError('Discussion topic not found. Create it first.', 'NotFound')
            }

            // Create list item for this user
            const listItemRkey = `participant-${topicId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}-${userDid.slice(-8)}`
            const listItemUri = `at://${serviceDid}/app.bsky.graph.listitem/${listItemRkey}`

            // Check if already a participant
            let alreadyMember = false
            await ctx.actorStore.read(serviceDid, async (store) => {
                const itemAtUri = new AtUri(listItemUri)
                const record = await store.record.getRecord(itemAtUri, null)
                alreadyMember = record !== null
            })

            if (!alreadyMember) {
                const listItemRecord = {
                    $type: 'app.bsky.graph.listitem',
                    subject: userDid,
                    list: listUri,
                    createdAt: new Date().toISOString(),
                }

                const listItemWrite = await prepareCreate({
                    did: serviceDid,
                    collection: 'app.bsky.graph.listitem',
                    rkey: listItemRkey,
                    record: listItemRecord,
                    validate: false,
                })

                const commit = await ctx.actorStore.transact(serviceDid, async (actorTxn) => {
                    const commit = await actorTxn.repo.processWrites([listItemWrite])
                    await ctx.sequencer.sequenceCommit(serviceDid, commit)
                    return commit
                })

                await ctx.accountManager.updateRepoRoot(serviceDid, commit.cid, commit.rev).catch(() => {})
            }

            return {
                encoding: 'application/json' as const,
                body: {
                    listUri,
                    listItemUri,
                },
            }
        },
    })
}
