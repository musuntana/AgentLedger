# ledger SDK — @agentledger/verify v0.1.0 — read-only Node SDK

**Status: GitHub prerelease, version 0.1.0.** Install the release archive
below. This SDK has not been published to the npm registry.
It is a **read-only** tool for Monad Testnet `eip155:10143`, *not*
a payment, custody, AgentRun or public-Testnet-acceptance SDK.

## Install (Node.js 22 or newer)

Install the versioned release archive from your own project:

```sh
npm install https://github.com/musuntana/monad-hackathon/releases/download/sdk-v0.1.0/agentledger-verify-0.1.0.tgz
```

With npm 12, URL dependencies require an explicit opt-in. Use
`npm install --allow-remote=root` with the same URL (and use that option
for subsequent installs of the URL dependency), or download the archive,
verify `SHA256SUMS`, and install the local `.tgz` file.

The package name remains `@agentledger/verify` for compatibility. It is
ESM-only; use `import` in an `.mjs` file or a project with `"type":"module"`.
Dependencies are installed by npm. No repository checkout, Foundry,
wallet, or SDK build tools are required to use the archive.

```js
import {createAgentLedgerVerifier, SDK_VERSION} from "@agentledger/verify";

const verifier = createAgentLedgerVerifier({
  rpcUrl: "https://testnet-rpc.monad.xyz"
});
console.log(SDK_VERSION); // "0.1.0"
// Query an existing task using its deployed contract address and bytes32 ID:
// const result = await verifier.observe(contractAddress, taskId);
```

The release includes `SHA256SUMS` for archive integrity verification.
Availability of this software does not establish paid Testnet acceptance
or chain finality. The package stays `private:true` to prevent accidental
npm registry publication; installing its `.tgz` archive is supported.

## Stability and compatibility contract

The root package exports **only** `createAgentLedgerVerifier`,
`SDK_VERSION` and `SDK_CAPABILITIES` (plus TypeScript type-only
declarations). Factory instances expose **only**
`observe / verify / reconcile` and immutable metadata.
`dist/index.mjs` plus `dist/index.d.mts` are built from the tested
source. The publish manifest includes only `dist/`, README and package
metadata. Tests exercise both Node 22 and 24.

```sh
cd sdk
npm install --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
npm run packcheck
npm run smoke
```

```js
import {createAgentLedgerVerifier} from "@agentledger/verify";

const sdk=createAgentLedgerVerifier({
  rpcUrl:"https://testnet-rpc.monad.xyz",
  // Optional: provide a different trusted RPC origin to cross-check.
  // witnessRpcUrl:"https://your-second-monad-rpc.example"
});
const observed=await sdk.observe(ledgerContract,taskId);
// observed.schemaVersion === "agentledger.sdk.read-only.v1"
// observed.status.state === "PaymentUnknown" (even if recorder says Proven)
// observed.rpcWitness === "SINGLE_RPC" or "DUAL_RPC_MATCHED"
// In dual mode: observed.rpcWitnessBlockNumber / rpcWitnessBlockHash
// identify the common historical block used for BOTH task reads.

const matched=await sdk.verify(ledgerContract,taskId,evidenceJson,{
  inputBytes: originalInputUint8Array,
  outputBytes: originalOutputUint8Array
});
// matched.match and matched.evidenceDigestMatched mean canonical Evidence
// JSON matches its chain anchor; optional original files are separate.
// matched.originalFilesCoverage: NOT_SUPPLIED / PARTIAL_MATCHED / BOTH_MATCHED
// matched.paymentVerified === false and matched.chargeAgain === false

const receipt=await sdk.reconcile({
  network:"eip155:10143",taskId,
  transaction:usdcTransactionHash,
  payer,payTo,
  amountAtomic:"1000",
  paymentNonce:eip3009Nonce
},{minConfirmations:2});
// receipt.status === "PaymentUnknown" *despite* a valid USDC receipt.
// receipt.blockNumber / confirmationsAtObservation / logIndex are
// independently recheckable read-only facts for this point in time.
// receipt.canonicalBlockCheckedAtObservation === true, but
// receipt.finalityProven === false, always.
// Receipt + consumed nonce ≠ independently verified payer intent,
// pre-charge reservation, finality or Agent execution correctness.
```

### Optional two-RPC observation

Configure `witnessRpcUrl` at SDK construction to make `observe`,
`verify`, and `reconcile` require **two** read-only RPC observations.
Both endpoints must use distinct, HTTPS (or local loopback HTTP) origins.
A missing, wrong-chain or inconsistent second source **never** falls back
to single-source success. Divergent task or payment receipt facts raise
`SDK_WITNESS_CONFLICT` with `retryable:false` and `chargeAgain:false`;
a temporary source outage or pending receipt permits only another
read-only observation.

`rpcWitness="DUAL_RPC_MATCHED"` denotes agreement at **two configured
RPC URLs**, not two independent infrastructure operators. Behind different
URLs the same node/provider may be used. In dual mode, **task** observations
are read at the lowest reported head height shared by both RPC URLs.
Both endpoints must agree on the corresponding block hash before the
historical contract reads and still agree immediately afterward.
`rpcWitnessBlockNumber` / `rpcWitnessBlockHash` expose this snapshot
identity; if either endpoint cannot provide historical state, SDK fails
closed and never falls back to `latest`. The subsequent block hash check
limits observation races; it does not provide atomic EIP-1898 hash-bound
contract calls or finality. **Receipt** observations remain independently
checked at each RPC's observation time; chain-head and confirmation counts
may differ, but transaction, event positions, block hash and nonce must agree. Agreement
does **not** prove finality, payment intent, task execution, or public
Testnet acceptance.

### Input normalization

- RPC URLs (primary and optional witness) are fixed once at SDK creation.
  The witness URL must differ from the primary origin. Only HTTPS or loopback HTTP
  is allowed; embedded credentials, arbitrary paths, query strings and
  URL fragments are rejected at construction. No caller-provided
  `client/transport/fetch/request`; those are refused **first**.
- `observe/verify` validate Ledger address and `bytes32` task ID
  before making a network request.
- `verify` accepts only `inputBytes` and `outputBytes` options,
  each an ArrayBuffer or typed-array view. Evidence JSON must match
  the strict `agentledger.evidence.v1` schema and SHA-256 anchor.
  Malformed Evidence and mismatched task identity are rejected **before**
  contacting RPC. Original files remain optional; `evidenceDigestMatched`
  and `originalFilesCoverage` tell consumers exactly what was checked.
  Both canonical Evidence and original byte views are copied **before the
  first awaited RPC call** (preventing caller-side mutation races).
  Each optional original byte buffer is limited to 10 MiB; oversized
  inputs fail locally without initiating a query.
- SDK result objects, including nested task and status observations, are
  frozen snapshots. Consumers must re-observe rather than mutating a result.
- `reconcile` returns the validated receipt's block number, event/transaction
  position, head height and confirmation count at observation time.
  `canonicalBlockCheckedAtObservation` records a contemporaneous block-hash
  comparison. Consumers can independently recheck these facts, but MUST NOT
  interpret them as stable finality, payer intent, or public acceptance.
- `reconcile` validates the exact descriptor schema **before** any
  RPC request: chain/network, task ID, transaction, payer, payTo,
  official Monad Testnet USDC token, positive decimal atomic amount,
  mandatory EIP-3009 nonce and bounded integer confirmation policy
  (1–1000). No arbitrary transport or per-call RPC override is
  forwarded to the chain verifier. The accepted receipt descriptor is
  snapshotted exactly once before validation and RPC to prevent asynchronous
  caller mutation or getter-driven changes between validation and use.
  Accessor fields and inherited required fields are rejected.
  Read-only receipt observation is
  intentionally weaker than the separate signed-intent + precharge
  Phase 0 CLI reconciliation.

### Stable failure contract

All SDK errors have:
`name="AgentLedgerSDKError"`, a stable `code` and `operation`,
`retryable` for **read-only observation only**, plus
`paymentStatus="PaymentUnknown"` and `chargeAgain=false`.
Sanitized `rpcStage` (`NONE / HEAD / BLOCK_HEADER / HISTORICAL_STATE /
CONTRACT_STATE / RECEIPT`) and `rpcRole` (`NONE / PRIMARY / WITNESS`)
identify the failing read-only step. They never reveal RPC URLs, wallet
payloads, approval signatures, raw JSON-RPC errors or provider credentials.
Historical state pruning and unsupported history methods have their own
non-retryable diagnostic rather than being presented as transient RPC loss.
The SDK's read-only viem transport uses a fixed 10-second timeout and no
automatic transport retries; the settlement verifier manages its own
bounded requests.

| Code | Meaning | Retryable read-only operation? |
|---|---|---|
| `SDK_TRANSPORT_FORBIDDEN` | Caller injected a client/transport/fetch | No |
| `SDK_INVALID_OPTIONS`, `SDK_INVALID_RPC_URL` | Invalid factory config | No |
| `SDK_INVALID_INPUT` | Invalid task, receipt, nonce or confirmation descriptor | No |
| `SDK_INVALID_EVIDENCE`, `SDK_EVIDENCE_MISMATCH` | Bad canonical format or digest conflict | No |
| `SDK_CHAIN_MISMATCH`, `SDK_TASK_UNAVAILABLE` | Wrong chain or unavailable contract task | No |
| `SDK_SETTLEMENT_INCONSISTENT` | Conflicting or malformed Transfer/nonce/receipt/canonical chain facts | No |
| `SDK_WITNESS_CONFLICT` | Distinct RPC URLs disagree on task or settlement chain facts | No |
| `SDK_HISTORICAL_STATE_UNAVAILABLE` | Required RPC history pruned or method unsupported; switch to a history-capable node | No |
| `SDK_SETTLEMENT_PENDING` | Original transaction receipt missing or confirmation threshold not yet met | Yes, **read-only reconciliation only** |
| `SDK_OBSERVATION_UNAVAILABLE` | RPC timeout/outage or ambiguous observation | Yes, **read-only only** |

A `retryable` error **never** licenses another charge, nonce reuse,
budget release, `recordPayment` or AgentRun execution. Failed
reconciliation is `PaymentUnknown`, not proof of unpaid status.

### Release / evidence gates

`phase0/reviewed-testnet-deployments.json` currently has no
independently reviewed contract entries. **Public Testnet acceptance is
BLOCKED**. Local Anvil and simulated journeys are valid software
tests but cannot establish paid Testnet acceptance or chain finality.
`private:true` prevents accidental npm registry publishing. Production promotion
requires a reviewed deployed contract, genuine settlement, consistent
evidence and an explicit production API review. ACP retains exclusive
authority over Agent execution, leases, replay and outcomes.

Full demonstration runbook:
[Verification Studio demo acceptance](../docs/verification-studio-demo-acceptance.md).

## Build an installable archive

From the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix sdk test
npm --prefix sdk run typecheck
npm --prefix sdk run packcheck
npm --prefix sdk run smoke
mkdir -p out/sdk
(cd sdk && npm pack --pack-destination ../out/sdk)
```

`prepack` builds the runtime and declarations before creating the archive.
The smoke check installs a real packed archive into a temporary consumer,
runs the SDK runtime tests through the package name, and checks TypeScript
imports against the installed declarations. Its RPCs are local fixtures;
it does not sign, charge, or claim live Testnet acceptance.
