# Bun Migration Notes

This document describes the migration from Node.js/pnpm to Bun for the atproto monorepo.

## Migration Status

### ✅ Completed

- **Package Manager**: Migrated from pnpm to Bun
- **Build System**: TypeScript builds work with `bun run build`
- **Workspace Configuration**: Converted `pnpm-workspace.yaml` to `package.json` workspaces
- **Docker Images**: Updated all service Dockerfiles to use Bun images
- **Type Fixes**: Added type assertions for ArrayBuffer/Uint8Array type mismatches
- **Dev Environment**: Works with `make run-dev-env` using `--conditions=node`

### ⚠️ Known Limitations

#### `better-sqlite3` Replaced with `bun:sqlite`

The `better-sqlite3` native addon has been replaced with Bun's native `bun:sqlite` module:

- **Custom Kysely Dialect**: Created `BunSqliteDialect` in `packages/pds/src/db/bun-sqlite-dialect.ts`
- **Type Declarations**: Added `packages/pds/src/db/bun-sqlite.d.ts` for TypeScript support

#### WebSocket Stream Polyfill

Bun doesn't support `createWebSocketStream` from the `ws` library. A Bun-compatible polyfill was created:

- **Location**: `packages/common/src/create-websocket-stream.ts`
- **Based on**: https://github.com/oven-sh/bun/pull/24304
- **Used by**: `@creatonproto/ws-client` and `@creatonproto/xrpc-server`

#### jose Library Patch

The `jose` library exports browser code for Bun by default, but this codebase uses Node.js crypto keys. A patch is applied:

- **Patch file**: `patches/jose@5.10.0.patch`
- **Effect**: Removes `"bun"` export conditions so Node.js paths are used

#### Dataplane Client: Connect Transport

The bsky dataplane client was changed from `createGrpcTransport` to `createConnectTransport`:

- **File**: `packages/bsky/src/data-plane/client/index.ts`
- **Reason**: Bun has issues with HTTP/2 trailers used by gRPC protocol
- **Effect**: Uses Connect protocol over HTTP/1.1 instead of gRPC over HTTP/2

#### Mute Operations (Workaround)

The `sc.mute()` calls in dev environment mock data generation are temporarily disabled:

- **Files**: `packages/dev-env/src/mock/index.ts`, `packages/dev-env/src/seed/thread-v2.ts`
- **Reason**: bsync's `addMuteOperation` returns Internal Server Error
- **Status**: Investigating - may be related to Connect transport or Bun HTTP handling
- **Impact**: Mute-related test data is not seeded, but mute functionality may work in production

## Configuration

### bunfig.toml

```toml
[install]
peer = false

[test]
timeout = 60000
preload = ["dotenv/config"]
```

### Runtime Flag

The `--conditions=node` flag is used to ensure Node.js export conditions are resolved (see Makefile).

### Pinned Dependencies

To ensure type compatibility, the following versions are pinned:

- `@types/node`: `18.19.67`
- `typescript`: `5.8.3`

## Running the Dev Environment

```bash
make run-dev-env
```

This starts:
- Dev-env introspection server (http://localhost:2581)
- DID Placeholder server (http://localhost:2582)
- Main PDS (http://localhost:2583)
- Ozone server (http://localhost:2587)
- Bsky Appview (http://localhost:2584)
- Feed Generators (dynamic ports)

## Building

```bash
bun install
bun run build
```

## Testing

Individual package tests can be run with:

```bash
bun test packages/<package>/tests
```

## Docker

All service Dockerfiles have been updated to use:
- `oven/bun:1` for build stage
- `oven/bun:1-alpine` for production stage

## Future Work

1. **Bun native `createWebSocketStream`** - Once https://github.com/oven-sh/bun/pull/24304 is merged, the polyfill can be removed
2. **jose library fix** - Once jose properly supports Bun's Node.js crypto, the patch can be removed
3. **Investigate mute operation failure** - Debug why bsync addMuteOperation fails
