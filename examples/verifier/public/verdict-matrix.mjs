// SPDX-License-Identifier: Apache-2.0
// Read-only, source-scoped verdicts. UI and exports must never promote a
// Recorder attestation, matching digest, or receipt to payment finality.
const HASH = /^0x[0-9a-fA-F]{64}$/;
function checkedCreation(receipt) {
  return receipt?.state === "CONFIRMED" &&
    HASH.test(receipt.transactionHash || "") &&
    HASH.test(receipt.blockHash || "") &&
    /^(0|[1-9][0-9]*)$/.test(String(receipt.blockNumber ?? ""));
}
export function observationMetrics({ simulation = true, readPathLatencyMs = null, creation = null } = {}) {
  const confirmed = !simulation && checkedCreation(creation);
  return {
    source: simulation ? "LOCAL_SIMULATION" : "TESTNET_TASK_READ_ONLY",
    // Browser -> same-origin service -> RPC. Not a pure RPC/network latency.
    readPathLatencyMs: !simulation && Number.isFinite(readPathLatencyMs) && readPathLatencyMs >= 0
      ? Math.round(readPathLatencyMs) : null,
    creationReceiptBlockNumber: confirmed ? String(creation.blockNumber) : null,
    creationReceiptBlockHash: confirmed ? creation.blockHash.toLowerCase() : null,
    // Studio has no independently verified payment/evidence receipts.
    paymentToEvidenceBlockSpan: null,
    writeGasUsedWei: null,
    finality: "NOT_VERIFIED",
  };
}
export function verificationMatrix({
  simulation = true, task = null, verification = "NOT_RUN", creation = null
} = {}) {
  const present = Boolean(task);
  const confirmed = !simulation && checkedCreation(creation);
  return [
    { id: "task", claim: "Task identity",
      checkedBy: simulation ? "Local fixture" : "Read-only RPC / creation receipt",
      state: !present ? "NOT_RUN" : simulation ? "SIMULATED_ONLY" : confirmed ? "CREATION_RECEIPT_MATCHED" : "TASK_STATE_OBSERVED" },
    { id: "payment", claim: "Payment settled", checkedBy: "Transfer + authorization nonce + finality",
      state: "PAYMENT_UNKNOWN" },
    { id: "evidence", claim: "Evidence bytes", checkedBy: "Local SHA-256 against digest",
      state: !present ? "NOT_RUN" : verification === "HASH_MATCHED"
        ? (simulation ? "LOCAL_HASH_MATCH" : "HASH_MATCH_NOT_EXECUTION")
        : verification === "TAMPER_REJECTED" ? "TAMPER_REJECTED" : "NOT_VERIFIED" },
    { id: "finality", claim: "Chain finality", checkedBy: "Independent finality verification",
      state: "NOT_VERIFIED" },
    { id: "execution", claim: "Execution correctness", checkedBy: "Independent execution evidence",
      state: "NOT_VERIFIED" },
  ];
}
