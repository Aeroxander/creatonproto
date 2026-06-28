import express from 'express'
import { z } from 'zod'
import type { IssuerAccessStore } from '../issuer/access-store'
import { createCrossmintOnrampOrder, type CrossmintOnrampConfig } from '../onramp/crossmint'

const profileSchema = z.object({
    did: z.string().startsWith('did:').max(2048),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    crossmintPaymentMethodId: z.string().max(128).optional(),
    enrollmentStatus: z.enum(['not_started', 'pending', 'active']).optional(),
    serverSignerAuthorized: z.boolean().optional(),
    autoRenewEnabled: z.boolean().optional(),
    billingTier: z.enum(['auto', 'manual']).optional(),
    receiptEmail: z.string().email().max(320).optional(),
})

const topUpSchema = z.object({
    did: z.string().startsWith('did:').max(2048),
    recipientWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int(),
    receiptEmail: z.string().email().max(320),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    paymentMethodId: z.string().max(128).optional(),
})

export function createBillingRouter(input: {
    accessStore: IssuerAccessStore
    crossmint?: CrossmintOnrampConfig
}): express.Router {
    const router = express.Router()

    router.get('/billing/profile/:did', async (req, res) => {
        const did = decodeURIComponent(req.params.did)
        if (!did.startsWith('did:')) return res.status(400).json({ error: 'InvalidDid' })
        const profile = await input.accessStore.getBillingProfile(did)
        if (!profile) return res.status(404).json({ error: 'ProfileNotFound' })
        return res.json({
            did: profile.did,
            walletAddress: profile.wallet_address,
            crossmintPaymentMethodId: profile.crossmint_payment_method_id,
            enrollmentStatus: profile.enrollment_status,
            serverSignerAuthorized: profile.server_signer_authorized === 1,
            autoRenewEnabled: profile.auto_renew_enabled === 1,
            billingTier: profile.billing_tier,
            receiptEmail: profile.receipt_email,
        })
    })

    router.put('/billing/profile', async (req, res) => {
        const parsed = profileSchema.safeParse(req.body)
        if (!parsed.success) return res.status(400).json({ error: 'InvalidRequest', message: parsed.error.message })
        const profile = await input.accessStore.upsertBillingProfile(parsed.data)
        return res.json({
            did: profile.did,
            walletAddress: profile.wallet_address,
            crossmintPaymentMethodId: profile.crossmint_payment_method_id,
            enrollmentStatus: profile.enrollment_status,
            serverSignerAuthorized: profile.server_signer_authorized === 1,
            autoRenewEnabled: profile.auto_renew_enabled === 1,
            billingTier: profile.billing_tier,
            receiptEmail: profile.receipt_email,
        })
    })

    router.post('/billing/top-up', async (req, res) => {
        if (!input.crossmint) return res.status(503).json({ error: 'OnrampUnavailable' })
        const parsed = topUpSchema.safeParse(req.body)
        if (!parsed.success) return res.status(400).json({ error: 'InvalidRequest', message: parsed.error.message })
        try {
            const order = await createCrossmintOnrampOrder(
                {
                    recipientDid: parsed.data.did,
                    recipientWallet: parsed.data.recipientWallet,
                    chainId: parsed.data.chainId,
                    receiptEmail: parsed.data.receiptEmail,
                    amount: parsed.data.amount,
                    paymentMethodId: parsed.data.paymentMethodId,
                },
                input.crossmint,
            )
            return res.json(order)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Top-up failed'
            return res.status(502).json({ error: 'TopUpFailed', message })
        }
    })

    return router
}
