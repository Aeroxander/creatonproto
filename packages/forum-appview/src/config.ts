export const config = {
    PORT: process.env.FORUM_APPVIEW_PORT ?? '3010',
    TAP_URL: process.env.TAP_URL ?? 'http://localhost:3000',
    TAP_ADMIN_PASSWORD: process.env.TAP_ADMIN_PASSWORD,
    DATABASE_URL: process.env.FORUM_DATABASE_URL ?? 'sqlite://./forum-appview.db',
    PAGERANK_DAMPING: Number(process.env.PAGERANK_DAMPING ?? '0.85'),
    PAGERANK_ITERATIONS: Number(process.env.PAGERANK_ITERATIONS ?? '20'),
}
