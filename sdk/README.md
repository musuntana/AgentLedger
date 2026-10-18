# @agentledger/verify v0.2.0-alpha.3 — read-only Node SDK

**Status: private pre-release.** This SDK has not been published to npm.
It is a **read-only** tool for Monad Testnet `eip155:10143`, *not*
a payment, custody, AgentRun or public-Testnet-acceptance SDK.

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
URLs the same node/provider may be used. Neither task observations nor
receipts are pinned to the same historical block in this alpha, so chain
progress between reads can cause safe false conflicts. Receipt chain-head
and confirmation counts are allowed to differ, but the underlying
transaction, event positions, block hash and nonce must agree. Agreement
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
Errors do not expose RPC URLs, wallet payloads or approval signatures.

| Code | Meaning | Retryable read-only operation? |
|---|---|---|
| `SDK_TRANSPORT_FORBIDDEN` | Caller injected a client/transport/fetch | No |
| `SDK_INVALID_OPTIONS`, `SDK_INVALID_RPC_URL` | Invalid factory config | No |
| `SDK_INVALID_INPUT` | Invalid task, receipt, nonce or confirmation descriptor | No |
| `SDK_INVALID_EVIDENCE`, `SDK_EVIDENCE_MISMATCH` | Bad canonical format or digest conflict | No |
| `SDK_CHAIN_MISMATCH`, `SDK_TASK_UNAVAILABLE` | Wrong chain or unavailable contract task | No |
| `SDK_SETTLEMENT_INCONSISTENT` | Conflicting or malformed Transfer/nonce/receipt/canonical chain facts | No |
| `SDK_WITNESS_CONFLICT` | Distinct RPC URLs disagree on task or settlement chain facts | No |
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
`private:true` prevents accidental npm publishing. SDK alpha promotion
requires a reviewed deployed contract, genuine settlement, consistent
evidence and an explicit production API review. ACP retains exclusive
authority over Agent execution, leases, replay and outcomes.

Full demonstration runbook:
[Verification Studio demo acceptance](../docs/verification-studio-demo-acceptance.md).
