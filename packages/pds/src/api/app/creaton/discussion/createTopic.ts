import { AtUriString, DidString } from '@atproto/syntax'
import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context'
import { com } from '../../../../lexicons/index.js'
import { prepareCreate } from '../../../../repo'

export default function (server: Server, ctx: AppContext) {
    server.add(com.creaton.discussion.createTopic, {
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // Any authenticated user can create a discussion topic
            },
        }),
        handler: async ({ auth, input }) => {
            const requesterDid = auth.credentials.did
            const { topicId, title, description } = input.body
            const serviceDid = ctx.cfg.service.did as DidString

            console.log(`[DiscussionCreateTopic] Request from ${requesterDid} for topic ${topicId}`)

            // Ensure PDS repo exists
            const pdsRepoExists = await ctx.actorStore.exists(serviceDid)
            if (!pdsRepoExists) {
                const crypto = await import('@atproto/crypto')
                const keypair = await crypto.Secp256k1Keypair.create({ exportable: true })
                await ctx.actorStore.create(serviceDid, keypair)
            }

            // Check if topic already exists
            const existingTopic = await ctx.actorStore.read(serviceDid, async (store) => {
                const records = await store.record.listRecordsForCollection({
                    collection: 'com.creaton.discussionTopic',
                    limit: 100,
                    reverse: false,
                })
                const found = records.find(r => (r.value as any).topicId === topicId)
                if (found) {
                    return {
                        uri: found.uri,
                        listUri: (found.value as any).listUri,
                    }
                }
                return null
            })

            if (existingTopic !== null) {
                console.log(`[DiscussionCreateTopic] Topic already exists: ${existingTopic.uri}`)
                const topic = existingTopic as { uri: string; listUri: string }
                return {
                    encoding: 'application/json' as const,
                    body: {
                        topicUri: topic.uri as AtUriString,
                        listUri: topic.listUri as AtUriString,
                    },
                }
            }

            // Create participant list
            const listRkey = `discussion-${topicId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)}`
            const listRecord = {
                $type: 'app.bsky.graph.list',
                name: `Discussion: ${title}`,
                purpose: 'app.bsky.graph.defs#curatelist',
                description: `Participants in discussion: ${title}`,
                createdAt: new Date().toISOString(),
            }

            const listUri = `at://${serviceDid}/app.bsky.graph.list/${listRkey}`

            const listWrite = await prepareCreate({
                did: serviceDid,
                collection: 'app.bsky.graph.list',
                rkey: listRkey,
                record: listRecord,
                validate: false,
            })

            // Create topic record
            const topicRkey = topicId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)
            const topicRecord: any = {
                $type: 'com.creaton.discussionTopic',
                topicId,
                title,
                listUri,
                creator: requesterDid,
                createdAt: new Date().toISOString(),
            }
            if (description) {
                topicRecord.description = description
            }

            const topicWrite = await prepareCreate({
                did: serviceDid,
                collection: 'com.creaton.discussionTopic',
                rkey: topicRkey,
                record: topicRecord,
                validate: false,
            })

            // Commit writes
            const commit = await ctx.actorStore.transact(serviceDid, async (actorTxn) => {
                let root: { cid: any; rev: any } | null = null
                try {
                    root = await actorTxn.repo.storage.getRootDetailed()
                } catch (e) {
                    // No root found
                }

                if (!root) {
                    const commit = await actorTxn.repo.createRepo([listWrite, topicWrite])
                    await ctx.sequencer.sequenceCommit(serviceDid, commit)
                    return commit
                } else {
                    const commit = await actorTxn.repo.processWrites([listWrite, topicWrite])
                    await ctx.sequencer.sequenceCommit(serviceDid, commit)
                    return commit
                }
            })

            await ctx.accountManager.updateRepoRoot(serviceDid, commit.cid, commit.rev).catch((e) => {
                console.error('[DiscussionCreateTopic] Failed to update repo root', e)
            })

            console.log(`[DiscussionCreateTopic] Success: ${topicWrite.uri}`)

            return {
                encoding: 'application/json' as const,
                body: {
                    topicUri: topicWrite.uri.toString() as AtUriString,
                    listUri: listUri as AtUriString,
                },
            }
        },
    })
}
