import { z } from 'zod'

const envSchema = z.object({
    PORT: z.string().default('3100'),
    TAP_URL: z.string().default('http://localhost:2480'),
    TAP_ADMIN_PASSWORD: z.string().optional(),
    RPC_URL: z.string().default('http://127.0.0.1:8545'),
    DATABASE_URL: z.string().default('sqlite://./token-votes.db'),
    FEED_GEN_URL: z.string().optional(),
})

export type Config = z.infer<typeof envSchema>

export function loadConfig(): Config {
    return envSchema.parse(process.env)
}

export const config = loadConfig()
