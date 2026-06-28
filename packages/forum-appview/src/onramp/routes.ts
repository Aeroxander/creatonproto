import express, { type Request, type Response } from 'express'
import {
    createCrossmintOnrampOrder,
    OnrampConfigError,
    onrampOrderRequestSchema,
    OnrampValidationError,
    OnrampWalletVerificationError,
    type CrossmintOnrampConfig,
} from './crossmint'

export interface OnrampRouterOptions {
    config: CrossmintOnrampConfig
    fetchImpl?: typeof fetch
}

export function createOnrampRouter(options: OnrampRouterOptions): express.Router {
    const router = express.Router()
    router.post('/onramp/orders', createOnrampOrderHandler(options))
    return router
}

export function createOnrampOrderHandler(options: OnrampRouterOptions) {
    return async (req: Request, res: Response) => {
        try {
            const parsed = onrampOrderRequestSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({
                    error: 'InvalidRequest',
                    message: parsed.error.message,
                })
            }

            const order = await createCrossmintOnrampOrder(
                parsed.data,
                options.config,
                options.fetchImpl,
            )
            return res.json(order)
        } catch (error) {
            if (error instanceof OnrampValidationError) {
                return res.status(400).json({ error: 'InvalidRequest', message: error.message })
            }
            if (error instanceof OnrampConfigError) {
                return res.status(503).json({ error: 'OnrampUnavailable', message: error.message })
            }
            if (error instanceof OnrampWalletVerificationError) {
                return res.status(409).json({
                    error: 'WalletVerificationRequired',
                    message: error.message,
                })
            }
            console.error('Crossmint onramp order failed:', error)
            const message = error instanceof Error ? error.message : 'Failed to create Crossmint order.'
            return res.status(502).json({ error: 'OnrampFailed', message })
        }
    }
}
