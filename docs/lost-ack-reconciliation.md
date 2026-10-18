# Read-only lost-ACK reconciliation — Monad Testnet only

A successful USDC payment and the AgentLedger contract's `Paid` state
are distinct facts. A missing HTTP response after x402 settlement must **not**
trigger a new `PAYMENT-SIGNATURE` request or a second payment.

This workflow reconstructs the task state **without signing, broadcasting,
retrying a charge, or mutating either SQLite journal**.

## Reconciliation inputs

- The original payer-signed EIP-712 `TaskPaymentApproval` JSON,
- The x402 settlement notice JSON containing the original transaction hash,
  payer, task, and **EIP-3009 paymentNonce** (recover these from the
  payer's original payment response if the server notice was lost),
- The operator-approved merchant USDC recipient,
- The same local `AGENTLEDGER_CHARGE_DB` used for the original pre-charge
  reservation, and a reachable Monad Testnet RPC (chain ID 10143).

No private key is required. If the pre-charge DB has been deleted, is hosted
by a different service instance, or is unreadable, reconciliation is
**UNKNOWN**: never silently recreate a reservation to force a success.

## Recovery from a persisted transaction hint

When the settlement callback persisted an **unverified** transaction hash in
the original SQLite pre-charge journal, the operator no longer needs the
standalone pending-receipt JSON. The original signed payer approval and
the EIP-3009 nonce are still required; these are not reconstructed from the
contract or an arbitrary task URL.

From the repository root:

```bash
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
export AGENTLEDGER_CHARGE_DB="$(pwd)/receipts/charge-attempts.db"
node examples/verifier/tools/reconcile-hint.mjs \
  ./approval.json \
  0xYOUR_ORIGINAL_EIP3009_NONCE \
  0xYOUR_APPROVED_TESTNET_USDC_RECEIVER
```

This command opens the existing SQLite DB **read-only**. If the hint is
missing, the DB is unavailable, the signature/quote disagrees with the
reservation, or the independent RPC check fails, it exits nonzero with
`UNKNOWN_NO_RECHARGE`. It never generates a replacement payment, changes
the reservation or claims failed/unpaid status. A successful read-only
classification still **does not prove finality** or authorize a Recorder write.
The stored callback hash is a lookup pointer, not a trusted payment receipt.

For a direct operator-supplied payment notice, use the original workflow below.

## Command

```bash
cd examples/verifier
npm install --no-audit --no-fund --ignore-scripts
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
export AGENTLEDGER_CHARGE_DB="$(pwd)/../../receipts/charge-attempts.db"
node tools/reconcile-task.mjs \
  ./approval.json \
  ../../receipts/0xYOUR_PAID_TRANSACTION_HASH.json \
  0xYOUR_APPROVED_TESTNET_USDC_RECEIVER
```

### Classifications

| Result | Meaning | Operator action |
| --- | --- | --- |
| `SETTLEMENT_OBSERVED_LEDGER_CREATED` | Matching payer signature, USDC Transfer + EIP-3009 AuthorizationUsed nonce, same pre-charge reservation; task still Created | Reconfirm chain finality / recorder authority, then manually decide whether to call recordPayment. **Never re-charge.** |
| `PAID_PAYMENT_MATCH` | Task is Paid with the *same* payer, amount and settlement reference | Already recorded. Do not resubmit recordPayment; check off-chain execution. |
| `PROVEN_PAYMENT_MATCH` | Task is Proven with matching payment record | Do not resubmit payment or Evidence; separately verify original Evidence bytes. |
| **Error / UNKNOWN** | RPC failure, absent nonce, missing pre-charge DB, invalid signatures, wrong chain, hash mismatch, wrong payee, amount or ledger conflict | Fail closed, investigate payment / ledger and retain original evidence. **Never blindly retry.** |

The CLI accepts a historical EIP-712 signature even after its
`expiresAt` has elapsed, because older successfully authorized payments
can require later reconciliation. This alone does **not** prove the
authorization was valid at charge time. The original HTTP admission check
and local pre-charge record are separate evidence; a local SQLite clock
is not an independently trusted timestamp.

### Strict limits

- A 2-block confirmation heuristic is not a protocol-level finality proof.
- Presence of a `Transfer` and `AuthorizationUsed` in the same receipt
  proves an observed on-chain authorization consumption. It does not
  guarantee exact serialized HTTP 402 challenge integrity, service
  correctness or that the Agent ran.
- Reconciliation inspects the shared *local* SQLite journal. It is not a
  distributed payment control plane or a provider-independent dedupe layer.
- The module does not perform a mainnet transaction, automatic refund,
  dispute resolution, contract write or Agent execution.
- Never remove a local reservation to re-open charging after a timeout.
  Payment has an irreversible side effect and unknown outcomes require
  observation and manual decision.

## Hermetic failure injection

```bash
cd examples/verifier
npm test
```

Tests simulate missing acknowledgments in Created, Paid and Proven states,
signature tampering, incorrect payer/amount/settlement reference, wrong
network, pre-charge nonce/quote mismatch and absent payment nonce.
They neither contact Monad nor use wallet funds.

**Truthful acceptance:** The hermetic tests do not demonstrate a full paid
Monad Testnet x402 → Recorder → Evidence sequence. A reviewed deployment,
real-wallet acceptance and explicit finality policy remain separate gates.

### Recovery CLI diagnostic privacy

`reconcile-hint.mjs` reads the local approval JSON with a 2 MiB file bound.
Failure exits nonzero with a generic `UNKNOWN_NO_RECHARGE` line; it does
not echo the original signed approval, private filesystem paths, or raw
provider error messages. Recover the exact original attempt locally and
never interpret this error as confirmation that the payment failed.
