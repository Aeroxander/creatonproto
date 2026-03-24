import { AtUri } from '@creatonproto/syntax'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { prepareDelete } from '../../../../repo'

export default function (server: Server, ctx: AppContext) {
    server.app.creaton.community.leave({
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // Basic auth check - user must be authenticated
            },
        }),
        handler: async ({ auth, input }) => {
            const did = auth.credentials.did
            const { daoAddress } = input.body

            // Normalize DAO address to lowercase
            const normalizedDao = daoAddress.toLowerCase()

            // Unique rkey for this community/user membership
            const listItemRkey = `member-${normalizedDao.slice(2, 10)}-${did.slice(-8)}`
            const listItemUri = `at://${did}/app.bsky.graph.listitem/${listItemRkey}`

            // Check if record exists before trying to delete
            let recordExists = false
            await ctx.actorStore.read(did, async (store) => {
                const itemAtUri = new AtUri(listItemUri)
                const record = await store.record.getRecord(itemAtUri, null)
                recordExists = record !== null
            })

            if (recordExists) {
                const deleteWrite = prepareDelete({
                    did,
                    collection: 'app.bsky.graph.listitem',
                    rkey: listItemRkey,
                })

                const commit = await ctx.actorStore.transact(did, async (actorTxn) => {
                    const commit = await actorTxn.repo.processWrites([deleteWrite])
                    await ctx.sequencer.sequenceCommit(did, commit)
                    return commit
                })

                await ctx.accountManager.updateRepoRoot(did, commit.cid, commit.rev).catch(() => { })
            }
        },
    })
}
