# Creaton Forum AppView

The AppView indexes public forum metadata and provides the payment and policy
gateway for protected boards. It never stores plaintext board keys.

## Protected-board gateway

Gateway mode is enabled when any gateway variable is present. All required
variables must then be configured:

```dotenv
FORUM_SERVICE_DID=did:plc:...
FORUM_MPP_SECRET=<at least 32 random bytes>
FORUM_MPP_SETTLER_PRIVATE_KEY=0x...
FORUM_REVENUE_ROUTER=0x...
FORUM_KMS_ENDPOINTS=https://kms-1.example,https://kms-2.example,...,https://kms-15.example
FORUM_KMS_BEARER_TOKEN=<service credential, optional>
FORUM_OPERATOR_REGISTRY=0x...
FORUM_REWARD_PDS_URL=https://pds.example
FORUM_REWARD_PDS_IDENTIFIER=rewards.example
FORUM_REWARD_PDS_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
FORUM_REWARD_TRIGGER=0x...
FORUM_REWARD_TRIGGER_PRIVATE_KEY=0x...
ABSTRACT_RPC_URL=https://api.mainnet.abs.xyz
PLC_URL=https://plc.directory
```

The `app.creaton.forum.requestKeyRelease` procedure authenticates the ATProto
DID and its Abstract Global Wallet, returns an Abstract MPP `charge` challenge
when no entitlement exists, and atomically settles ERC-3009 payment through the
configured `AccessRevenueRouter`. The router deposits 90% into the board's
`ForumPosterRewardVault` balance and 10% into the CREATE KMS reward vault.

At 00:00 UTC each Monday, the AppView writes the prior week's canonical vote
dataset to deterministic gzip blobs in the issuer PDS and publishes an
`app.creaton.forum.rewardSnapshot` record. The WAVS service independently reads
that immutable record after the AppView emits the configured EVM trigger, then
submits the 10-of-15 committee-attested Merkle root.
Claims remain available indefinitely through `ForumPosterRewardVault`.

## Crossmint onramp

When `CROSSMINT_SERVER_API_KEY` and `CROSSMINT_TOKEN_LOCATOR` are set, the AppView
also serves `POST /onramp/orders` for card-funded USDC checkout. See
`../red-dwarf/docs/crossmint-onramp.md` and `.env.example` in this package.

Creator boards with `paymentProtocol: direct-usdc` also expose
`POST /xrpc/app.creaton.forum.confirmBoardPayment` after a wallet USDC transfer.

After settlement, the AppView forwards the fixed-block entitlement evidence to
`POST /v1/releases` on `creaton-kms`. It returns only independently signed,
HPKE-encrypted 10-of-15 partial shares. The old x402/key-grant source remains in
the tree solely for database and deployment migration; it is not mounted by the
running AppView.

## Verification

```bash
pnpm --filter @creatonproto/forum-appview build
pnpm --filter @creatonproto/forum-appview test
```
