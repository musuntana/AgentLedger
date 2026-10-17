# AgentLedger

[中文](README.md) | English

AgentLedger is a Monad Testnet hackathon prototype for recording tasks, observing payment state and verifying file evidence. It includes a wallet-free demo, a read-only Studio, a wallet workbench and a separate native-MON payment experiment.

**Status: experimental prototype, not production-ready. The MON integration and recent UI changes still require runtime acceptance.**

## Run locally

Use Node.js 22 or newer. Python tests also require Python 3 and `pytest`.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

| Entry | Address | Purpose | Wallet required? |
| --- | --- | --- | --- |
| Guided demo | <http://127.0.0.1:4322/demo> | Explore tasks, payment claims and evidence checks in about three minutes | No |
| Testnet workbench | <http://127.0.0.1:4322> | Deploy the ledger, create tasks and recover transactions | For writes |
| Verification Studio | <http://127.0.0.1:4322/studio> | Look up tasks and verify local evidence | No |
| MON payment experiment | <http://127.0.0.1:4322/mon> | Transfer test MON, record payment and anchor evidence | Yes |
| Standalone verifier | <http://127.0.0.1:4321> | Use Studio as a separate read-only service | No |

Switch display language at the top right. Language selection does not change task input, signing parameters, hashes or exported records.

Signing requires a desktop browser with the MetaMask extension. For remote development, forward **4322** for the workbench and same-origin Studio; also forward **4321** when using the standalone verifier. A phone's `127.0.0.1` points to the phone itself. Mobile QR wallet connection is not implemented.

`npm run dev` manages the two processes it starts and stops them on Ctrl+C. It does not terminate existing services on those ports. To run the services separately, use `npm start` and `npm run deploy:testnet`.

## Start with the wallet-free demo

Open the guided demo and start the local walkthrough. The first six steps work offline. The seventh is an optional read-only Testnet lookup.

| Step | Demonstration | Source |
| --- | --- | --- |
| 1. Task record | Bind the input SHA-256 to a task identifier | Local simulation |
| 2. Payment claim | Show a recorder claim while payment remains `PaymentUnknown` | Local simulation |
| 3. Tool output | Compute text statistics and download original input and output | Actual browser calculation; simulated ledger anchor |
| 4. Evidence check | Compare canonical evidence and input/output SHA-256 | Browser calculation; simulated chain anchor |
| 5. Tampering | Reject an output after changing one byte | Actual local verification |
| 6. Lost acknowledgement | Keep unknown payment outcomes from triggering automatic repeat payments | Local simulation |
| 7. Public task | Recheck a public task's creation transaction and current state | Real read-only Testnet RPC; network availability required |

`phase0/demo-showcase.json` supplies the public task identity. It is not an approval registry or a cached claim of current success. RPC failures, missing tasks and identity mismatches remain visible failures; the UI never substitutes simulated data for a chain result.

The local evidence scenario provides `evidence.json`, `input.txt` and `output.json` for download and re-verification. Exported `summary.json` retains its data source. Restarting the demo only resets the simulation and preserves wallet journals. See the [presenter walkthrough](docs/demo-walkthrough.md).

## Deploy and create a Testnet task

1. Connect MetaMask in the workbench and select Monad Testnet, chain ID **10143**.
2. Review `paymentRecorder`. It can record payment attestations and is immutable after deployment. Switching wallet accounts does not change contract permissions.
3. Claim test MON, refresh the balance, estimate deployment fees and confirm deployment in MetaMask.
4. Check the original deployment transaction. The workbench verifies transaction parameters, the canonical block, runtime code and recorder. Reconnecting also rechecks an existing deployment.
5. Enter the exact task input and a positive integer budget cap, estimate creation fees and confirm in MetaMask. This entry uses USDC atomic units: `1000` means `0.001 USDC`. The cap only constrains recorded payment claims.
6. The read-only service checks the original transaction, `TaskCreated` event and task parameters, then opens the same-origin Studio. Pending receipts receive bounded rechecks, never resubmission. Manual rechecking is also available.

Refreshing restores deployment and task journals. If a wallet response is lost, find the original transaction hash in MetaMask activity and verify it through recovery. Saved signature parameters are locked to preserve recovery data. Do not repeat deployment or task creation because an acknowledgement is missing. Download and keep the original records.

This workbench only deploys contracts and creates tasks. It does not pay USDC, call `recordPayment` or execute Agents. Deployment does not automatically enter the reviewed registry. See [workbench and recovery](docs/testnet-workspace.md).

## Native-MON payment experiment

This separate flow takes amounts in MON and stores them in wei. Its amounts must not be interpreted as USDC.

1. Deploy and verify the contract in the workbench, using payer account A as its recorder.
2. Open the MON payment experiment, connect A and enter another externally owned account B that you control, an amount and a description. There is no default recipient.
3. Review the transfer summary and consent option. MetaMask requests four separate confirmations: task creation, MON transfer, payment attestation and evidence anchoring.
4. Follow the timeline and download records. After an interruption, continue the original run. Recover a missing transaction hash before proceeding.

Transaction intents, parameters and evidence stay in the current browser and are not uploaded. Original journals prevent automatic resubmission; a browser lock coordinates same-origin tabs. Different browser profiles, devices and origins do not share that lock. Recover in the original browser.

MON payment evidence uses `agentledger.mon-payment.v1`; tool-execution evidence uses `agentledger.evidence.v1`. These formats are not interchangeable. Results come from the wallet RPC and are not independent USDC acceptance or a finality guarantee. Unsupported historical balance queries or other recipient activity in the same block can interrupt verification without causing another transfer.

The implementation adapts teammate code pinned at [`5742899`](https://github.com/linyuze/monadevidence/tree/5742899190d07410740b08d8cfb118955cb9a371/agentledger-mon). See [MON integration and recovery](docs/mon-payment-integration.md) for adaptations and outstanding acceptance work.

## Read the states correctly

| State or result | Meaning |
| --- | --- |
| `Created` | The contract contains a task record |
| `Paid` | The recorder attests that payment occurred |
| `Proven` | The contract contains an evidence digest |
| `PaymentUnknown` | Payment has not been independently established; it does not mean unpaid or failed |
| Matching SHA-256 | The compared bytes and digest agree; this does not prove correct Agent execution |

Public observation states include `Created`, `PaymentUnknown`, `PaymentObserved`, `PaymentRecorded`, `EvidenceAnchored` and `Conflict`, separately from Solidity storage states. An unknown payment outcome never authorizes automatic recharge, nonce reuse or reservation release. See the [fact contract](docs/phase0-contract.md) and [payment threat model](docs/payment-approval.md).

## Pocket companion and presentation materials

`apps/pocket` is a standalone Expo mobile/Web companion for read-only task, payment and evidence observation, including a lost-acknowledgement demo. It verifies canonical SHA-256 and original files on-device and queries real tasks through the local verifier's `GET /api/task`. It does not sign or write on chain. File limits are 2 MiB for evidence and 10 MiB each for input/output, with strict UTF-8 handling.

Start the services in separate terminals:

```bash
# Terminal 1: start the verifier from the repository root
npm start
```

```bash
# Terminal 2: install and start Pocket
cd apps/pocket
npm ci --ignore-scripts --no-audit --no-fund
npm run web
```

The Web address is normally <http://localhost:8081>. See the [Pocket guide](apps/pocket/README.md) and [historical read-only acceptance record](docs/pocket-testnet-acceptance.md). Historical results do not establish acceptance for the current version.

For judges, use the seven-slide pitch: [Chinese](slides/judge.md) or [English](slides/judge.en.md). The full technical appendix remains in `slides/slides.md`.

```bash
cd slides
npm ci --ignore-scripts --no-audit --no-fund
npm run build:judge
npm run build:judge:en
```

See the [presentation guide](slides/README.md) for exports. Participants handle competition registration and submission manually; see [submission readiness](docs/monad-blitz-submission.md).

## Read-only SDK

`sdk` provides the unpublished `@agentledger/verify@0.2.0-alpha.3` package with `observe`, `verify` and receipt-only `reconcile`. Receipt reconciliation alone cannot establish verified payment. See the [SDK contract](sdk/README.md) for interfaces, error codes and constraints.

## Verification commands and current limits

These commands are available; listing them is not a claim that they ran or passed. This copy/documentation update did not run application tests, browser acceptance or chain transactions. The MON integration still requires separate acceptance.

| Command | Scope |
| --- | --- |
| `npm test` | Node.js, SDK and Python tests |
| `npm run onsite:check` | Offline demo readiness |
| `npm run submit:check` | Offline presentation-link and sensitive-file checks; no upload or submission |
| `npm run test:pocket` | Pocket unit tests |
| `npm run test:pocket:typecheck` | Pocket type checking |
| `npm run test:browser` | Local simulation browser checks |
| `npm run test:browser:anvil` | Local Anvil contract/browser checks |
| `npm run test:browser:live` | Read-only public Testnet checks; local services required |

Browser checks require Chrome/Chromium; set `AGENTLEDGER_CHROME_PATH` if needed. Anvil checks also require Foundry. Pocket has its own `test:browser:live` command that writes a read-only observation under `out/pocket-live-testnet/` using exclusive creation. Preserve prior evidence before handling that output directory for a rerun.

See the [CI workflow](.github/workflows/ci.yml); actual execution depends on the run for the specific commit. Public Testnet payment acceptance requirements are documented [separately](docs/live-testnet-observation.md).
