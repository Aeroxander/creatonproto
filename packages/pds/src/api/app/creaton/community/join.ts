import { AtUri } from '@creatonproto/syntax'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { prepareCreate } from '../../../../repo'
import { InvalidRequestError } from '@creatonproto/xrpc-server'

export default function (server: Server, ctx: AppContext) {
    server.app.creaton.community.join({
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // Basic auth check - user must be authenticated
            },
        }),
        handler: async ({ auth, input }) => {
            const userDid = auth.credentials.did
            const { daoAddress } = input.body
            const serviceDid = ctx.cfg.service.did

            // Normalize DAO address
            const normalizedDao = daoAddress.toLowerCase()

            // 1. Find the canonical community details in PDS repo
            let listUri: string | null = null
            await ctx.actorStore.read(serviceDid, async (store) => {
                const records = await store.record.listRecordsForCollection({
                    collection: 'app.creaton.community.details',
                    limit: 100, // Reasonable limit for now
                    reverse: false
                })
                const found = records.find(r => (r.value as any).daoAddress.toLowerCase() === normalizedDao)
                if (found) {
                    listUri = (found.value as any).listUri
                }
            })

            if (!listUri) {
                throw new InvalidRequestError('Community not found. Please create it first.', 'NotFound')
            }

            // 2. Add user to the canonical list in PDS repo
            const listItemRkey = `member-${normalizedDao.slice(2, 10)}-${userDid.slice(-8)}`
            const listItemUri = `at://${serviceDid}/app.bsky.graph.listitem/${listItemRkey}`

            // Check if already a member in PDS repo
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

                await ctx.accountManager.updateRepoRoot(serviceDid, commit.cid, commit.rev).catch(() => { })
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
