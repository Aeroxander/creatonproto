import {
  Hex,
  createPublicClient,
  http,
  defineChain,
  getAddress,
} from 'viem'
import { abstract } from 'viem/chains'
import { createSiweMessage, generateSiweNonce } from 'viem/siwe'
import { InvalidRequestError } from '@creatonproto/xrpc-server'
import { AccountDb } from '../db'

export const publicClient = createPublicClient({
  chain: abstract,
  transport: http(),
})

// Configuration - should be set from environment
const SIWE_DOMAIN = process.env.SIWE_DOMAIN || 'creaton.social'
const SIWE_URI = process.env.SIWE_URI || `https://${SIWE_DOMAIN}`

/**
 * Normalize an Ethereum address to checksummed format
 */
const normalizeAddress = (address: string): `0x${string}` => {
  try {
    return getAddress(address)
  } catch {
    throw new InvalidRequestError('Invalid Ethereum address format')
  }
}

/**
 * Verify a SIWE login signature for an existing account
 */
export const verifySIWELogin = async (
  db: AccountDb,
  did: string,
  siweSignature: Hex,
): Promise<boolean> => {
  const foundUser = await db.db
    .selectFrom('account')
    .selectAll()
    .where('did', '=', did)
    .executeTakeFirst()

  if (!foundUser || !foundUser.evmAddress) {
    return false
  }

  const address = normalizeAddress(foundUser.evmAddress)

  const found = await db.db
    .selectFrom('siwe_login')
    .selectAll()
    .where('did', '=', did)
    .executeTakeFirst()

  if (found) {
    const { siweMessage } = found

    try {
      const verified = await publicClient.verifySiweMessage({
        address: address,
        message: siweMessage,
        signature: siweSignature,
      })

      if (verified) {
        // Delete the SIWE message after successful verification (single use)
        await db.db.deleteFrom('siwe_login').where('did', '=', did).execute()
        return true
      }
    } catch (err) {
      console.error('SIWE login verification failed:', err)
      return false
    }
  }
  return false
}

/**
 * Verify a SIWE registration signature for a new account
 */
export const verifySIWERegistration = async (
  db: AccountDb,
  evmAddress: string,
  siweSignature: Hex,
): Promise<boolean> => {
  const normalizedAddress = normalizeAddress(evmAddress)

  const found = await db.db
    .selectFrom('siwe_registration')
    .selectAll()
    .where('evmAddress', '=', normalizedAddress)
    .executeTakeFirst()

  if (!found) {
    console.error('SIWE registration not found for address:', normalizedAddress)
    return false
  }

  const { siweMessage } = found

  try {
    console.log('Verifying SIWE message for address:', normalizedAddress)
    console.log('SIWE message:', siweMessage)

    const verified = await publicClient.verifySiweMessage({
      address: normalizedAddress,
      message: siweMessage,
      signature: siweSignature,
    })

    console.log('SIWE verification result:', verified)

    if (verified) {
      await db.db
        .deleteFrom('siwe_registration')
        .where('evmAddress', '=', normalizedAddress)
        .execute()
      return true
    }
  } catch (err) {
    console.error('SIWE registration verification failed:', err)
    return false
  }

  return false
}

/**
 * Create a SIWE login message for an existing account
 */
export const siweLogin = async (
  db: AccountDb,
  did: string,
): Promise<string> => {
  const nonce = generateSiweNonce()
  const createdAt = new Date().toISOString()

  let siweMessage = ''

  const found = await db.db
    .selectFrom('account')
    .selectAll()
    .where('did', '=', did)
    .executeTakeFirst()

  if (found) {
    if (!found.evmAddress) {
      throw new InvalidRequestError('Account has no Ethereum address linked')
    }

    const address = normalizeAddress(found.evmAddress)

    siweMessage = createSiweMessage({
      address: address,
      chainId: abstract.id,
      domain: SIWE_DOMAIN,
      nonce: nonce,
      uri: SIWE_URI,
      version: '1',
      statement: 'Log in to Creaton Account',
    })

    // Check if an entry already exists for this DID
    const existing = await db.db
      .selectFrom('siwe_login')
      .where('did', '=', did)
      .selectAll()
      .executeTakeFirst()

    if (existing) {
      // Update the existing entry
      await db.db
        .updateTable('siwe_login')
        .set({ siweMessage, createdAt })
        .where('did', '=', did)
        .execute()
    } else {
      // Insert a new entry
      await db.db
        .insertInto('siwe_login')
        .values({ did, createdAt, siweMessage })
        .execute()
    }
  } else {
    throw new InvalidRequestError('Could not find account')
  }
  return siweMessage
}

/**
 * Create a SIWE registration message for a new account
 */
export const siweRegistration = async (
  db: AccountDb,
  evmAddress: string,
): Promise<string> => {
  const normalizedAddress = normalizeAddress(evmAddress)

  console.log('Creating SIWE registration for address:', normalizedAddress + ' unnormalized: ' + evmAddress)
  const nonce = generateSiweNonce()
  const createdAt = new Date().toISOString()

  const siweMessage = createSiweMessage({
    address: normalizedAddress,
    chainId: abstract.id,
    domain: SIWE_DOMAIN,
    nonce: nonce,
    uri: SIWE_URI,
    version: '1',
    statement: 'Register Creaton Account',
  })

  // Check if an entry already exists for this evmAddress
  const existing = await db.db
    .selectFrom('siwe_registration')
    .where('evmAddress', '=', normalizedAddress)
    .selectAll()
    .executeTakeFirst()

  if (existing) {
    // Update the existing entry
    await db.db
      .updateTable('siwe_registration')
      .set({ siweMessage, createdAt })
      .where('evmAddress', '=', normalizedAddress)
      .execute()
  } else {
    // Insert a new entry
    await db.db
      .insertInto('siwe_registration')
      .values({ evmAddress: normalizedAddress, createdAt, siweMessage })
      .execute()
  }

  return siweMessage
}

/**
 * Get account by Ethereum address
 */
export const getAccountByevmAddress = async (
  db: AccountDb,
  evmAddress: string,
) => {
  const normalizedAddress = normalizeAddress(evmAddress)
  return db.db
    .selectFrom('account')
    .innerJoin('actor', 'actor.did', 'account.did')
    .where('account.evmAddress', '=', normalizedAddress)
    .selectAll('account')
    .select(['actor.handle', 'actor.createdAt', 'actor.takedownRef'])
    .executeTakeFirst()
}

/**
 * Update account with Ethereum address
 */
export const setAccountevmAddress = async (
  db: AccountDb,
  did: string,
  evmAddress: string,
) => {
  const normalizedAddress = normalizeAddress(evmAddress)
  await db.db
    .updateTable('account')
    .set({ evmAddress: normalizedAddress })
    .where('did', '=', did)
    .execute()
}
