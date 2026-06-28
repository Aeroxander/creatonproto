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
TEMPO_RPC_URL=https://rpc.tempo.xyz
PLC_URL=https://plc.directory
```

Protected boards use Tempo MPP subscriptions (`paymentProtocol: tempo`). The
`app.creaton.forum.confirmBoardPayment` procedure verifies a Tempo MPP
subscription payment and records an entitlement. `app.creaton.forum.requestKeyRelease`
then authenticates the ATProto DID and linked wallet, requires an active
entitlement, and forwards fixed-block eligibility evidence to `creaton-kms`.

At 00:00 UTC each Monday, the AppView writes the prior week's canonical vote
dataset to deterministic gzip blobs in the issuer PDS and publishes an
`app.creaton.forum.rewardSnapshot` record. The WAVS service independently reads
that immutable record after the AppView emits the configured EVM trigger, then
submits the 10-of-15 committee-attested Merkle root.
Claims remain available indefinitely through `ForumPosterRewardVault`.

## Crossmint onramp

When `CROSSMINT_SERVER_API_KEY` and `CROSSMINT_TOKEN_LOCATOR` are set, the AppView
also serves `POST /onramp/orders` for card-funded PathUSD checkout on Tempo
testnet (chain ID 42429 by default). See `.env.example` in this package.

After entitlement activation, the AppView forwards the fixed-block entitlement
evidence to `POST /v1/releases` on `creaton-kms`. It returns only independently
signed, HPKE-encrypted 10-of-15 partial shares.

## Verification

```bash
pnpm --filter @creatonproto/forum-appview build
pnpm --filter @creatonproto/forum-appview test
```
