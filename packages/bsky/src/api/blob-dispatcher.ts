import { Readable } from 'node:stream'
import { Agent, Dispatcher, Pool, RetryAgent } from 'undici'
import { isUnicastIp, unicastLookup } from '@atproto-labs/fetch-node'
import { ServerConfig } from '../config'
import { RETRYABLE_HTTP_STATUS_CODES } from '../util/retry'

// Check if we're running on Bun (undici stream() is not available)
const isBun = typeof process !== 'undefined' && !!process.versions?.bun

/**
 * Creates a Bun-compatible dispatcher that uses native fetch 
 * to provide a stream() method similar to undici's Dispatcher.
 * 
 * This is needed because Bun's undici compatibility layer doesn't
 * include the stream() method that the blob-resolver depends on.
 */
function createBunDispatcher(cfg: ServerConfig): Dispatcher {
  return {
    async stream(
      options: Dispatcher.RequestOptions,
      factory: Dispatcher.StreamFactory,
    ): Promise<Dispatcher.StreamData> {
      const url = new URL(options.path || '/', options.origin as string)
      
      const headers: Record<string, string> = {}
      if (options.headers) {
        if (options.headers instanceof Map) {
          options.headers.forEach((v, k) => { headers[k] = v })
        } else if (Array.isArray(options.headers)) {
          for (let i = 0; i < options.headers.length; i += 2) {
            headers[options.headers[i] as string] = options.headers[i + 1] as string
          }
        } else {
          Object.assign(headers, options.headers)
        }
      }

      const controller = new AbortController()
      const signal = options.signal as AbortSignal | undefined
      if (signal) {
        signal.addEventListener('abort', () => controller.abort())
      }

      const response = await fetch(url.toString(), {
        method: (options.method as string) || 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      })

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        // Skip content-encoding and content-length since fetch auto-decompresses
        // and the content-length would be wrong after decompression
        if (lowerKey === 'content-encoding' || lowerKey === 'content-length') {
          return
        }
        responseHeaders[lowerKey] = value
      })

      const upstreamData: Dispatcher.StreamFactoryData = {
        statusCode: response.status,
        headers: responseHeaders,
        opaque: options.opaque,
        context: {},
      }

      const writable = factory(upstreamData)
      
      if (response.body) {
        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            writable.write(Buffer.from(value))
          }
          writable.end()
        } catch (err) {
          writable.destroy(err as Error)
          throw err
        }
      } else {
        writable.end()
      }

      return {
        opaque: options.opaque,
        trailers: {},
      }
    },
  } as Dispatcher
}

export function createBlobDispatcher(cfg: ServerConfig): Dispatcher {
  // Use Bun-compatible dispatcher if running on Bun
  if (isBun) {
    return createBunDispatcher(cfg)
  }
  
  const baseDispatcher = new Agent({
    allowH2: cfg.proxyAllowHTTP2, // This is experimental
    headersTimeout: cfg.proxyHeadersTimeout,
    maxResponseSize: cfg.proxyMaxResponseSize,
    bodyTimeout: cfg.proxyBodyTimeout,
    factory: cfg.disableSsrfProtection
      ? undefined
      : (origin, opts) => {
          const { protocol, hostname } =
            origin instanceof URL ? origin : new URL(origin)
          if (protocol !== 'https:') {
            throw new Error(`Forbidden protocol "${protocol}"`)
          }
          if (isUnicastIp(hostname) === false) {
            throw new Error('Hostname resolved to non-unicast address')
          }
          return new Pool(origin, opts)
        },
    connect: {
      lookup: cfg.disableSsrfProtection ? undefined : unicastLookup,
    },
  })

  return cfg.proxyMaxRetries > 0
    ? new RetryAgent(baseDispatcher, {
        statusCodes: [...RETRYABLE_HTTP_STATUS_CODES],
        methods: ['GET', 'HEAD'],
        maxRetries: cfg.proxyMaxRetries,
      })
    : baseDispatcher
}
