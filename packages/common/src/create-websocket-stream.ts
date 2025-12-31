/**
 * A Bun-compatible polyfill for ws.createWebSocketStream
 *
 * Based on https://github.com/oven-sh/bun/pull/24304
 * This implementation uses Node.js Duplex streams with backpressure management
 * to provide a WebSocket-to-stream bridge that works in both Node.js and Bun.
 */
import { Duplex, DuplexOptions } from 'node:stream'
import { WebSocket } from 'ws'

const WEBSOCKET_OPEN = 1

export function createWebSocketStream(
  ws: WebSocket,
  options: DuplexOptions = {},
): Duplex {
  const { decodeStrings = true, ...duplexOptions } = options

  const queue: Buffer[] = []
  let paused = false
  let ended = false

  const duplex = new Duplex({
    ...duplexOptions,
    write(chunk, _encoding, callback) {
      if (ws.readyState !== WEBSOCKET_OPEN) {
        callback(new Error('WebSocket is not open'))
        return
      }
      try {
        ws.send(chunk)
        callback()
      } catch (err) {
        callback(err as Error)
      }
    },
    final(callback) {
      try {
        if (ws.readyState === WEBSOCKET_OPEN) ws.close()
        callback()
      } catch (err) {
        callback(err as Error)
      }
    },
    read() {
      if (!paused) return
      paused = false
      while (queue.length && !paused) {
        const msg = queue.shift()!
        if (!duplex.push(msg)) paused = true
      }

      if (!queue.length && ended) duplex.push(null)
    },
  })

  function pushData(data: Buffer) {
    if (!paused) {
      const ok = duplex.push(data)
      if (!ok) paused = true
      return
    }
    queue.push(data)
  }

  const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      let buffer: Buffer
      if (Buffer.isBuffer(data)) {
        buffer = data
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data)
      } else if (Array.isArray(data)) {
        buffer = Buffer.concat(data)
      } else {
        buffer = Buffer.from(data as unknown as ArrayBufferLike)
      }

      if (decodeStrings && typeof data === 'string') {
        buffer = Buffer.from(data, 'utf8')
      }

      pushData(buffer)
    } catch (err) {
      duplex.destroy(err as Error)
    }
  }

  const onClose = () => {
    ended = true
    if (queue.length === 0) duplex.push(null)
  }

  const onError = (err: Error) => {
    duplex.destroy(err)
  }

  // Use EventEmitter API if available (ws library), otherwise use addEventListener
  if (typeof ws.on === 'function') {
    ws.on('message', onMessage)
    ws.on('close', onClose)
    ws.on('error', onError)

    // Cleanup on duplex close
    duplex.on('close', () => {
      ws.off('message', onMessage)
      ws.off('close', onClose)
      ws.off('error', onError)
    })
  } else {
    // For native WebSocket (browser-like API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedOnMessage = (event: any) => {
      onMessage(event.data as Buffer | ArrayBuffer | Buffer[])
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedOnError = (_err: any) => {
      onError(new Error('WebSocket error'))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsAsEventTarget = ws as any

    wsAsEventTarget.addEventListener('message', wrappedOnMessage)
    wsAsEventTarget.addEventListener('close', onClose)
    wsAsEventTarget.addEventListener('error', wrappedOnError)

    // Cleanup on duplex close
    duplex.on('close', () => {
      wsAsEventTarget.removeEventListener('message', wrappedOnMessage)
      wsAsEventTarget.removeEventListener('close', onClose)
      wsAsEventTarget.removeEventListener('error', wrappedOnError)
    })
  }

  return duplex
}
