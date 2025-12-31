/* eslint-env node */

'use strict'

const assert = require('node:assert')
const path = require('node:path')

const { BskyAppView, ServerConfig } = require('@creatonproto/bsky')
const { Secp256k1Keypair } = require('@creatonproto/crypto')

const main = async () => {
  const env = getEnv()
  const config = ServerConfig.readEnv()
  assert(env.serviceSigningKey, 'must set BSKY_SERVICE_SIGNING_KEY')
  const signingKey = await Secp256k1Keypair.import(env.serviceSigningKey)
  const bsky = BskyAppView.create({ config, signingKey })
  await bsky.start()
  // Graceful shutdown (see also https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/)
  const shutdown = async () => {
    await bsky.destroy()
  }
  process.on('SIGTERM', shutdown)
}

const getEnv = () => ({
  serviceSigningKey: process.env.BSKY_SERVICE_SIGNING_KEY || undefined,
})

main()
