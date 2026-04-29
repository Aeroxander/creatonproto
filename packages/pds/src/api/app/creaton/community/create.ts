import { AtUri, AtUriString, DidString } from '@atproto/syntax'
import * as crypto from '@atproto/crypto'
import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context'
import { app } from '../../../../lexicons/index.js'
import { prepareCreate } from '../../../../repo'

export default function (server: Server, ctx: AppContext) {
    server.add(app.creaton.community.create, {
        auth: ctx.authVerifier.authorization({
            checkTakedown: true,
            authorize: () => {
                // Any authenticated user can initialize a community on the PDS
            },
        }),
        handler: async ({ auth, input }) => {
            try {
                const requesterDid = auth.credentials.did
                const { daoAddress, name, symbol } = input.body
                const serviceDid = ctx.cfg.service.did as DidString

                console.log(`[CommunityCreate] Request from ${requesterDid} for DAO ${daoAddress}`)

                // Normalize DAO address
                const normalizedDao = daoAddress.toLowerCase()
                const daoRkey = normalizedDao.slice(2, 10)

                // 1. Ensure PDS repo exists
                const pdsRepoExists = await ctx.actorStore.exists(serviceDid)
                console.log(`[CommunityCreate] PDS Repo exists? ${pdsRepoExists}`)

                if (!pdsRepoExists) {
                    console.log(`[CommunityCreate] Creating PDS repo for ${serviceDid}`)
                    const keypair = await crypto.Secp256k1Keypair.create({ exportable: true })
                    await ctx.actorStore.create(serviceDid, keypair)
                    console.log(`[CommunityCreate] PDS repo created`)
                }

                // 2. Check if community details record already exists
                const existingCommunity = await ctx.actorStore.read(serviceDid, async (store) => {
                    const records = await store.record.listRecordsForCollection({
                        collection: 'app.creaton.community.details',
                        limit: 100,
                        reverse: false
                    })
                    const found = records.find(r => (r.value as any).daoAddress.toLowerCase() === normalizedDao)
                    if (found) {
                        return {
                            uri: found.uri,
                            listUri: (found.value as any).listUri
                        }
                    }
                    return null
                })

                if (existingCommunity !== null) {
                    console.log(`[CommunityCreate] Community already exists: ${existingCommunity.uri}`)
                    const community = existingCommunity as { uri: string, listUri: string }
                    return {
                        encoding: 'application/json' as const,
                        body: {
                            communityUri: community.uri as AtUriString,
                            listUri: community.listUri as AtUriString,
                        },
                    }
                }

                // 3. Create the canonical member list in PDS repo
                const listRkey = `community-members-${daoRkey}`
                console.log(`[CommunityCreate] Creating list with rkey ${listRkey}`)

                const listRecord = {
                    $type: 'app.bsky.graph.list',
                    name: `${name} Members`,
                    purpose: 'app.bsky.graph.defs#curatelist',
                    description: `Official member list for ${name} (${symbol})`,
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

                // 4. Create community details record in PDS repo
                console.log(`[CommunityCreate] Creating community details record`)
                const communityRecord = {
                    $type: 'app.creaton.community.details',
                    daoAddress: normalizedDao,
                    name,
                    symbol,
                    listUri,
                    createdAt: new Date().toISOString(),
                }

                const communityWrite = await prepareCreate({
                    did: serviceDid,
                    collection: 'app.creaton.community.details',
                    record: communityRecord,
                    validate: false,
                })

                console.log(`[CommunityCreate] Committing writes...`)
                console.log(`[CommunityCreate] Committing writes...`)
                const commit = await ctx.actorStore.transact(serviceDid, async (actorTxn) => {
                    let root: { cid: any; rev: any } | null = null
                    try {
                        root = await actorTxn.repo.storage.getRootDetailed()
                    } catch (e) {
                        // No root found, will perform genesis
                    }

                    if (!root) {
                        console.log(`[CommunityCreate] No repo root found. Performing genesis commit via createRepo`)
                        const commit = await actorTxn.repo.createRepo([listWrite, communityWrite])
                        await ctx.sequencer.sequenceCommit(serviceDid, commit)
                        return commit
                    } else {
                        console.log(`[CommunityCreate] Repo root found (${root.cid.toString()}). Appending commit via processWrites`)
                        const commit = await actorTxn.repo.processWrites([listWrite, communityWrite])
                        await ctx.sequencer.sequenceCommit(serviceDid, commit)
                        return commit
                    }
                })

                await ctx.accountManager.updateRepoRoot(serviceDid, commit.cid, commit.rev).catch((e) => {
                    console.error('[CommunityCreate] Failed to update repo root', e)
                })

                console.log(`[CommunityCreate] Success!`)

                return {
                    encoding: 'application/json' as const,
                    body: {
                        communityUri: communityWrite.uri.toString() as AtUriString,
                        listUri: listUri as AtUriString,
                    },
                }
            } catch (err: any) {
                console.error('[CommunityCreate] Error in handler:', err)
                // Re-throw valid XRPC errors, wrap others
                throw err
            }
        },
    })
}
