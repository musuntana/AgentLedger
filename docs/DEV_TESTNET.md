# AgentLedger development fast lane (Testnet only)

This is a **development workflow**, not a production or public-acceptance claim.
You do **not** need to register a PR-reviewed deployment to deploy your own
Monad Testnet contract or observe it. Keep the strict
\`live-acceptance.mjs\` command for release evidence only.

## Quick start

\`\`\`bash
npm ci --ignore-scripts --no-audit --no-fund
npm run wallet:dev
npm run dev
\`\`\`

\`wallet:dev\` creates a fresh EOA Testnet key in
\`~/.config/agentledger/dev-wallets/throwaway-*/wallet.json\` (directory 0700,
file 0600). Its stdout contains **only** the address and the local path,
not the private key. Use the address with the official Monad Testnet faucet
(check current official docs for faucet, RPC and available Testnet assets).
Never commit, paste, export publicly, or reuse this key on mainnet.
The tool runs on **your own computer**, not inside a hosted chat.

Open the local wallet workbench on \`http://127.0.0.1:4322\`.
Import the throwaway key into a **dedicated** browser wallet test profile
using the local secret file (do not paste it into chat). On chain 10143,
deploy a ledger, create a task, then test MON or supported Testnet USDC/x402
using a dedicated faucet-funded wallet. The x402 gate is a separate service:
read \`docs/precharge-x402-gate.md\` and preserve the exact signed
approval, EIP-3009 nonce and precharge database. After any uncertain
settlement, **inspect the original attempt; do not retry paying**.

## Development-only readback without reviewed deployment

Create \`dev-request.json\` locally (never commit sensitive approval/receipt data):

\`\`\`json
{
  "schemaVersion": "agentledger.dev-observe.v1",
  "chainId": 10143,
  "ledger": "0xYOUR_DEPLOYED_LEDGER_ADDRESS",
  "taskId": "0xYOUR_CREATED_BYTES32_TASK_ID",
  "attempt": "NotEstablished"
}
\`\`\`

To independently test payment and Evidence, optionally supply the existing
\`payment\` (signed approval, pending receipt, exact payee) and \`evidence\`
(file paths) fields from the Phase 0 inspector.

\`\`\`bash
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
npm run dev:observe -- ./dev-request.json ./dev-observation.json
\`\`\`

Result is always clearly labeled \`DEV_TESTNET_ONLY\`,
\`publicAcceptance:false\`, \`finalityProven:false\`,
\`chargeAgain:false\`, even when the read-only verifier observes consistent
receipt and byte facts. Save each report under a new filename; the CLI does
not overwrite previous evidence. It never signs, broadcasts, modifies
journal state, or executes an Agent. **Unknown means unknown, not unpaid**.

For the formal public acceptance workflow, independently review deployment
identity and run the existing \`live-acceptance.mjs\` with the immutable
reviewed-deployment registry and complete chain evidence. Do not relabel a
dev report as acceptance.

Safety tests, git secret scanning and production release review remain
separate. See \`docs/live-testnet-observation.md\`.
