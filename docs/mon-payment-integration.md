# MON payment integration

Run `npm run dev`, then open <http://127.0.0.1:4322/mon> in a desktop browser
with MetaMask. This is a native-MON experiment, separate from USDC/x402 and
`agentledger.evidence.v1` tool-execution evidence.

## User journey

1. In the existing workspace, deploy and verify the current AgentLedger contract.
   Use account A as its immutable paymentRecorder.
2. Open **MON 支付实验**, connect account A and select Monad Testnet.
   A verified workspace deployment address is prefilled as a convenience;
   this page checks the runtime code and recorder again before starting.
3. Fill a different EOA account B that you control, the MON amount and description.
   There is no default payee. The default amount is 0.001 MON, editable before starting.
4. Review the consent checkbox and start. MetaMask asks separately for task
   creation, native transfer, recorder attestation and evidence anchoring.
5. Download the current record, including partial evidence and all transaction
   journals. Results are observations from the wallet RPC, not an independent
   public-payment acceptance gate or a finality guarantee.

All transactions use the fixed chain ID 10143. Each submission rechecks account
and chain, estimates gas and reads gasPrice. The browser holds no private keys.
The server only serves allowlisted assets: no teammate evidence-write or log-upload
endpoint was imported. Input, evidence and journals stay in localStorage until
explicitly downloaded. Preserve browser data during recovery.

## Recovery

**Continue the original run instead of starting another transfer.** Run parameters
are locked once persisted. Each transaction has a separate journal written before
the wallet signature request, with sender, destination, calldata, value and nonce.
Returned hashes are reused and checked against these parameters and a canonical
receipt block. A missing hash stops that stage; paste the original transaction
hash from wallet activity into the recovery section. Pending receipts do not cause
resubmission. Explicit wallet rejection removes that stage's unsubmitted intent,
so continuing may request that stage again. Unknown outcomes remain blocked.

A browser-wide Web Lock prevents concurrent writers across tabs on the same
origin. It does not coordinate different origins, browser profiles or devices.
Do not run the same payment experiment from multiple browser profiles.

The edit/new-run button preserves the archive and never deletes transaction
journals. It allows editing when no transaction intent exists, or starts a new
experiment after the previous run has completed. An interrupted run with a
transaction intent cannot be discarded using this button.

Balance change is measured at the transfer block and its predecessor, so replay
does not use a newly sampled baseline. Other activity affecting B in the same
block can cause an explicit mismatch. RPCs without historical balance support
may prevent completion; a failure never triggers another transfer. A chain reorg
can invalidate earlier observations; this experiment has no finality monitor.

## Source and adaptations

Imported from [linyuze/monadevidence](https://github.com/linyuze/monadevidence/tree/5742899190d07410740b08d8cfb118955cb9a371/agentledger-mon)
at exact commit `5742899190d07410740b08d8cfb118955cb9a371`:

- `abi.js` -> `examples/verifier/tools/mon/abi.mjs`
- `sha256.js` -> `examples/verifier/tools/mon/sha256.mjs`
- `mon-evidence.mjs` and `pipeline.mjs`, adapted in that directory

The upstream files carry SPDX Apache-2.0 notices, retained in the imported files.
The browser page, journal adapter and server integration are local implementations.
The teammate server, headless signer, historical sample evidence, artifact and
fixed payee are not imported.

Local changes support the current contract's `None` response for absent tasks,
validate existing task parameters, reject a mismatched recorder before transfer,
require a persistent submission adapter, preserve evidence before later writes,
check receipt/transaction/canonical-block identity, and keep MON amounts in wei.
The payment evidence schema remains `agentledger.mon-payment.v1`. Matching this
schema is not a USDC settlement claim or proof of tool execution.

## Upstream merge and presentation

The local `dev` branch was fast-forwarded to `origin/dev` commit
`f4654a8cbb052585afc4346c0e9f6821f07c8bd2` (the bilingual Studio, wallet and
Pocket update) before restoring the local MON integration. The header conflict
was resolved by keeping both the language switch and the MON entry. The local
pre-merge integration remains in recovery stash `1ab8da2c72ac`.
The teammate source HEAD was checked again and remains the pinned `5742899`.

Studio, deployment workspace and MON panel now share `experience.css`, common
navigation, distinct local/read-only/wallet entry paths and bilingual display copy.
The MON panel groups account, transfer and consent inputs separately, provides
an explicit transfer preview and a ten-stage timeline, and keeps raw records in
an expandable section. On phones the preview appears before consent. Human
labels and placeholders can be translated; input values, hashes, evidence,
transaction journals and technical RPC step details remain unchanged.

## Verification status

Implementation and regression cases have been added. **No tests, browser checks,
wallet operations or public-chain transactions were executed for this integration**,
following the current session constraint. It is not accepted for live payment use.

When test execution is authorized, the relevant offline command is
`node --test examples/verifier/test/mon-integration.test.mjs`, followed by the
existing verifier suite and a browser check. Wallet and public-chain acceptance
remain separate manual gates requiring explicit review of account, payee and amount.
