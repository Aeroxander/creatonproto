import { gzipSync } from 'node:zlib'
import { Code, ConnectError, ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect'
import { GetSitemapPageRequest } from '../../../proto/bsky_pb'

const MOCK_SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://bsky.app/sitemap/users/2025-01-01/1.xml.gz</loc>
  </sitemap>
</sitemapindex>`

const MOCK_SITEMAP_PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://bsky.app/profile/test.bsky.social</loc>
  </url>
</urlset>`

export default (): Partial<ServiceImpl<typeof Service>> => ({
  async getSitemapIndex() {
    const compressed = gzipSync(Buffer.from(MOCK_SITEMAP_INDEX))
    // Create a fresh Buffer with ArrayBuffer backing to satisfy strict types
    const sitemap = Buffer.alloc(compressed.byteLength)
    sitemap.set(compressed)
    return { sitemap }
  },
  async getSitemapPage(req: GetSitemapPageRequest) {
    const date = req.date?.toDate()
    const isExpectedDate =
      date &&
      date.getFullYear() === 2025 &&
      date.getMonth() === 0 &&
      date.getDate() === 1
    const isExpectedBucket = req.bucket === 1

    if (!isExpectedDate || !isExpectedBucket) {
      throw new ConnectError('Sitemap page not found', Code.NotFound)
    }

    const compressed = gzipSync(Buffer.from(MOCK_SITEMAP_PAGE))
    // Create a fresh Buffer with ArrayBuffer backing to satisfy strict types
    const sitemap = Buffer.alloc(compressed.byteLength)
    sitemap.set(compressed)
    return { sitemap }
  },
})
