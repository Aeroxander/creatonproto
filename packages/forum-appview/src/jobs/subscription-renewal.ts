import cron from 'node-cron'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema'
import { IssuerAccessStore } from '../issuer/access-store'

export class SubscriptionRenewalJob {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly accessStore: IssuerAccessStore,
    ) {}

    schedule() {
        cron.schedule('0 * * * *', () => {
            void this.run().catch((error) => {
                console.error('Subscription renewal job failed:', error)
            })
        })
    }

    async run(now = new Date()) {
        const expiring = await this.accessStore.listExpiringEntitlements(48 * 60 * 60 * 1_000, now)
        for (const entitlement of expiring) {
            const profile = await this.accessStore.getBillingProfile(entitlement.did)
            if (!profile || profile.auto_renew_enabled !== 1) continue
            const access = await this.db.selectFrom('forum_board_access').selectAll()
                .where('board_uri', '=', entitlement.board_uri).executeTakeFirst()
            if (!access || access.payment_protocol !== 'tempo') continue
            console.log(
                `[renewal] scheduled ${entitlement.board_uri} for ${entitlement.did} ` +
                `(tier=${profile.billing_tier}, expires=${entitlement.expires_at})`,
            )
            // Proactive Tempo renewSubscription + Crossmint top-up runs here once wallet RPC is wired.
        }
    }
}
