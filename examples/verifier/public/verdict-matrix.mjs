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

 
// Machine-readable states are stable for tests/exports, but are not appropriate
// as judge-facing copy. Unknown new states fail closed instead of looking green.
const VERDICT_LABELS = Object.freeze({
  NOT_RUN: ['Not checked', '尚未检查'],
  NOT_VERIFIED: ['Not verified', '尚未验证'],
  PAYMENT_UNKNOWN: ['Payment outcome unknown', '支付结果未知'],
  SIMULATED_ONLY: ['Local simulation only', '仅本地模拟'],
  TASK_STATE_OBSERVED: ['Task state observed', '已观察任务状态'],
  CREATION_RECEIPT_MATCHED: ['Creation receipt matched', '创建回执已匹配'],
  LOCAL_HASH_MATCH: ['Local bytes matched', '本地字节匹配'],
  HASH_MATCH_NOT_EXECUTION: ['Digest matched · not execution proof', '摘要匹配 · 不代表执行正确'],
  TAMPER_REJECTED: ['Tampered bytes rejected', '已拒绝被篡改的字节'],
});
const OBSERVED_STATES = new Set([
  'CREATION_RECEIPT_MATCHED','LOCAL_HASH_MATCH','HASH_MATCH_NOT_EXECUTION',
]);
const LIMITED_STATES = new Set(['SIMULATED_ONLY','TASK_STATE_OBSERVED']);
export function verdictStateLabel(state, lang = 'en') {
  const pair = VERDICT_LABELS[state];
  return pair ? pair[lang === 'zh' ? 1 : 0] : lang === 'zh' ? '未知状态 · 未验证' : 'Unknown state · not verified';
}
export function verdictTone(state) {
  if (state === 'TAMPER_REJECTED') return 'verdict-rejected';
  if (LIMITED_STATES.has(state)) return 'verdict-limited';
  return OBSERVED_STATES.has(state) ? 'verdict-observed' : 'verdict-unverified';
}
