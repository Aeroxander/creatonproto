/**
 * Bun-compatible proxy agent that implements the undici Dispatcher interface
 * using native fetch() instead of undici's Agent.request()/stream() methods.
 *
 * This is needed because Bun's undici polyfill stubs the Dispatcher class
 * without implementing the actual request/stream methods.
 */

import { IncomingHttpHeaders } from 'node:http'
import { Readable, Writable } from 'node:stream'
import * as undici from 'undici'
import { isUnicastIp, unicastLookup } from '@atproto-labs/fetch-node'

// Re-export Dispatcher type for use elsewhere
type Dispatcher = undici.Dispatcher

export interface BunProxyAgentOptions {
  headersTimeout?: number
  bodyTimeout?: number
  maxResponseSize?: number
  disableSsrfProtection?: boolean
  maxRetries?: number
}

/**
 * Response data from proxy agent request - compatible with undici.undici.Dispatcher.ResponseData
 * but using Node.js Readable for the body instead of undici's BodyReadable
 */
export interface ProxyResponseData {
  statusCode: number
  headers: IncomingHttpHeaders
  body: Readable
  trailers: Record<string, string>
  opaque?: unknown
  context: Record<string, unknown>
}

/**
 * Common interface for proxy agents that works with both undici Dispatcher and BunProxyAgent
 */
export interface ProxyAgentLike {
  request(options: undici.Dispatcher.RequestOptions): Promise<ProxyResponseData>
  stream(
    options: undici.Dispatcher.RequestOptions,
    factory: undici.Dispatcher.StreamFactory,
  ): Promise<undici.Dispatcher.StreamData>
  destroy?(): Promise<void>
  close?(): Promise<void>
}

/**
 * A Bun-compatible proxy agent that uses native fetch() for HTTP requests.
 * Implements the ProxyAgentLike interface needed for pipethrough.
 */
export class BunProxyAgent implements ProxyAgentLike {
  private options: BunProxyAgentOptions

  constructor(options: BunProxyAgentOptions = {}) {
    this.options = {
      headersTimeout: options.headersTimeout ?? 10_000,
      bodyTimeout: options.bodyTimeout ?? 30_000,
      maxResponseSize: options.maxResponseSize,
      disableSsrfProtection: options.disableSsrfProtection ?? false,
      maxRetries: options.maxRetries ?? 0,
    }
  }

  /**
   * Perform SSRF protection by validating the hostname resolves to a unicast address
   */
  private async validateSsrf(hostname: string): Promise<void> {
    if (this.options.disableSsrfProtection) return

    // Check if hostname is already an IP address
    if (hostname.match(/^[\d.]+$/) || hostname.includes(':')) {
      // It's already an IP address, check if unicast
      if (isUnicastIp(hostname) === false) {
        throw new Error('Hostname resolved to non-unicast address')
      }
      return
    }

    // For domain names, use unicastLookup which already validates
    // unicastLookup will throw if it resolves to non-unicast
    try {
      await new Promise<void>((resolve, reject) => {
        unicastLookup(hostname, {}, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch {
      throw new Error('Hostname resolved to non-unicast address')
    }
  }

  /**
   * Build the full URL from dispatch options
   */
  private buildUrl(options: undici.Dispatcher.RequestOptions): URL {
    const origin =
      typeof options.origin === 'string'
        ? options.origin
        : options.origin?.toString() ?? ''
    const path = options.path ?? '/'
    return new URL(path, origin)
  }

  /**
   * Convert dispatch headers to fetch Headers
   */
  private buildHeaders(
    headers: undici.Dispatcher.RequestOptions['headers'],
  ): Headers {
    const fetchHeaders = new Headers()

    if (!headers) return fetchHeaders

    if (Array.isArray(headers)) {
      // Array format: [key1, val1, key2, val2, ...]
      for (let i = 0; i < headers.length; i += 2) {
        const key = headers[i]
        const val = headers[i + 1]
        if (key && val) {
          fetchHeaders.set(String(key), String(val))
        }
      }
    } else if (typeof headers === 'object') {
      // Object format
      for (const [key, val] of Object.entries(headers)) {
        if (val != null) {
          if (Array.isArray(val)) {
            fetchHeaders.set(key, val.join(', '))
          } else {
            fetchHeaders.set(key, String(val))
          }
        }
      }
    }

    return fetchHeaders
  }

  /**
   * Convert a Node.js Readable stream (request body) to a ReadableStream for fetch
   */
  private bodyToReadableStream(
    body: undici.Dispatcher.RequestOptions['body'],
  ): ReadableStream<Uint8Array> | string | null {
    if (!body) return null

    if (typeof body === 'string') return body

    if (body instanceof Readable) {
      // Convert Node.js Readable to Web ReadableStream
      return Readable.toWeb(body) as ReadableStream<Uint8Array>
    }

    // For other iterables, buffer them
    if (
      typeof body === 'object' &&
      Symbol.asyncIterator in body
    ) {
      return new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of body as AsyncIterable<Uint8Array>) {
              controller.enqueue(chunk)
            }
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        },
      })
    }

    return null
  }

  /**
   * Convert fetch Response headers to IncomingHttpHeaders format.
   *
   * IMPORTANT: fetch() automatically decompresses responses (gzip, deflate, br),
   * so we must strip content-encoding and content-length headers to avoid
   * telling the client the body is compressed when it's actually decompressed.
   */
  private responseHeadersToIncoming(headers: Headers): IncomingHttpHeaders {
    const incoming: IncomingHttpHeaders = {}
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      // Skip content-encoding and content-length since fetch auto-decompresses
      // and the content-length would be wrong after decompression
      if (lowerKey === 'content-encoding' || lowerKey === 'content-length') {
        return
      }
      incoming[lowerKey] = value
    })
    return incoming
  }

  /**
   * Convert Web ReadableStream to Node.js Readable
   * Using manual implementation instead of Readable.fromWeb() for Bun compatibility
   */
  private webStreamToNodeReadable(
    webStream: ReadableStream<Uint8Array> | null,
  ): Readable {
    if (!webStream) {
      return Readable.from([])
    }

    // Manual implementation for better Bun compatibility
    // Readable.fromWeb() may not work correctly in Bun
    const reader = webStream.getReader()
    let reading = false
    let finished = false

    const readable = new Readable({
      async read() {
        if (reading || finished) return
        reading = true

        try {
          const { done, value } = await reader.read()
          if (done) {
            finished = true
            this.push(null)
          } else {
            // push() returns false if the stream wants us to stop pushing
            // In that case, Node will call read() again when it's ready
            this.push(value)
          }
        } catch (err) {
          this.destroy(err as Error)
        } finally {
          reading = false
        }
      },
      destroy(err, callback) {
        finished = true
        reader.cancel(err?.message).catch(() => {})
        callback(err)
      },
    })

    return readable
  }

  /**
   * Implements undici.Dispatcher.request() using native fetch
   */
  async request(
    options: undici.Dispatcher.RequestOptions,
  ): Promise<ProxyResponseData> {
    const url = this.buildUrl(options)

    // SSRF protection
    if (!this.options.disableSsrfProtection && url.protocol !== 'https:') {
      throw new Error(`Forbidden protocol "${url.protocol}"`)
    }
    await this.validateSsrf(url.hostname)

    const fetchHeaders = this.buildHeaders(options.headers)
    const body = this.bodyToReadableStream(options.body)

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, this.options.headersTimeout! + this.options.bodyTimeout!)

    let lastError: Error | undefined
    const maxAttempts = 1 + (this.options.maxRetries ?? 0)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: options.method as string,
          headers: fetchHeaders,
          body: body as RequestInit['body'],
          signal: controller.signal,
          duplex: body ? 'half' : undefined,
          // Disable keep-alive to prevent connection pooling issues in Bun
          keepalive: false,
        } as RequestInit)

        clearTimeout(timeout)

        const responseHeaders = this.responseHeadersToIncoming(response.headers)
        const nodeBody = this.webStreamToNodeReadable(response.body)

        // Check max response size if configured
        if (this.options.maxResponseSize) {
          const contentLength = response.headers.get('content-length')
          if (contentLength) {
            const size = parseInt(contentLength, 10)
            if (size > this.options.maxResponseSize) {
              nodeBody.destroy()
              throw new Error(
                `Response size ${size} exceeds maximum ${this.options.maxResponseSize}`,
              )
            }
          }
        }

        return {
          statusCode: response.status,
          headers: responseHeaders,
          body: nodeBody,
          trailers: {},
          opaque: options.opaque,
          context: {},
        }
      } catch (err) {
        lastError = err as Error

        // Only retry on network errors for GET/HEAD methods
        const method = (options.method as string).toUpperCase()
        const isRetryable =
          (method === 'GET' || method === 'HEAD') &&
          attempt < maxAttempts - 1 &&
          !(err instanceof DOMException && err.name === 'AbortError')

        if (!isRetryable) {
          clearTimeout(timeout)
          throw err
        }
      }
    }

    clearTimeout(timeout)
    throw lastError ?? new Error('Request failed')
  }

  /**
   * Implements undici.Dispatcher.stream() using native fetch
   * This pipes the response directly to the provided factory's writable stream
   */
  async stream(
    options: undici.Dispatcher.RequestOptions,
    factory: undici.Dispatcher.StreamFactory,
  ): Promise<undici.Dispatcher.StreamData> {
    const url = this.buildUrl(options)

    // SSRF protection
    if (!this.options.disableSsrfProtection && url.protocol !== 'https:') {
      throw new Error(`Forbidden protocol "${url.protocol}"`)
    }
    await this.validateSsrf(url.hostname)

    const fetchHeaders = this.buildHeaders(options.headers)
    const body = this.bodyToReadableStream(options.body)

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, this.options.headersTimeout! + this.options.bodyTimeout!)

    try {
      const response = await fetch(url.toString(), {
        method: options.method as string,
        headers: fetchHeaders,
        body: body as RequestInit['body'],
        signal: controller.signal,
        duplex: body ? 'half' : undefined,
        // Disable keep-alive to prevent connection pooling issues in Bun
        keepalive: false,
      } as RequestInit)

      clearTimeout(timeout)

      const responseHeaders = this.responseHeadersToIncoming(response.headers)

      // Call the factory with upstream info to get the writable stream
      const writable = factory({
        statusCode: response.status,
        headers: responseHeaders,
        opaque: options.opaque,
        context: {},
      })

      // Use duck typing to check if writable has write/end methods
      // In Bun, Express's ServerResponse may not pass instanceof Writable check
      // but still has the write() and end() methods we need
      const isWritableLike = writable &&
        typeof (writable as any).write === 'function' &&
        typeof (writable as any).end === 'function'

      // Pipe the response body to the writable
      if (isWritableLike) {
        const writableStream = writable as { write: (chunk: Buffer) => void; end: () => void }

        try {
          // In Bun, piping web streams can be problematic.
          // Instead, read the response as arrayBuffer and write it directly.
          // This is less efficient but more reliable.
          const arrayBuffer = await response.arrayBuffer()

          if (arrayBuffer.byteLength > 0) {
            const buffer = Buffer.from(arrayBuffer)
            writableStream.write(buffer)
          }
          writableStream.end()
        } catch {
          writableStream.end()
        }
      }

      return {
        trailers: {},
        opaque: options.opaque,
      }
    } catch (err) {
      clearTimeout(timeout)
      throw err
    }
  }

  /**
   * Destroy the agent (no-op for fetch-based implementation)
   */
  async destroy(): Promise<void> {
    // No cleanup needed for fetch-based implementation
  }

  /**
   * Close the agent (no-op for fetch-based implementation)
   */
  async close(): Promise<void> {
    // No cleanup needed for fetch-based implementation
  }
}

/**
 * Check if we're running in Bun
 */
export function isBun(): boolean {
  return typeof globalThis.Bun !== 'undefined'
}

/**
 * Create a proxy agent that works in both Node.js and Bun
 */
export function createProxyAgent(
  options: BunProxyAgentOptions & {
    allowH2?: boolean
  },
): ProxyAgent {
  if (isBun()) {
    return new BunProxyAgent(options)
  }

  // For Node.js, use undici directly (already imported at top)
  const proxyAgentBase = new undici.Agent({
    allowH2: options.allowH2,
    headersTimeout: options.headersTimeout,
    maxResponseSize: options.maxResponseSize,
    bodyTimeout: options.bodyTimeout,
    factory: options.disableSsrfProtection
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
          return new undici.Pool(origin, opts)
        },
    connect: {
      lookup: options.disableSsrfProtection ? undefined : unicastLookup,
    },
  })

  const agent =
    options.maxRetries && options.maxRetries > 0
      ? new undici.RetryAgent(proxyAgentBase, {
          statusCodes: [], // Only retry on socket errors
          methods: ['GET', 'HEAD'],
          maxRetries: options.maxRetries,
        })
      : proxyAgentBase

  // Cast undici Dispatcher to ProxyAgentLike - undici Dispatcher implements these methods
  return agent as unknown as ProxyAgent
}

// Type alias for the proxy agent that works in both environments
export type ProxyAgent = ProxyAgentLike
