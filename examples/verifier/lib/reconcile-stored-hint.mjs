// SPDX-License-Identifier: Apache-2.0
// Reconstruct an expected receipt from an UNVERIFIED local callback hash.
// This module never signs, broadcasts, retries a charge, or mutates journals.
import { hashTypedData, verifyTypedData } from "viem";
import { buildApprovalData, assertAddress, assertHex32 } from "../../../lib/approval-format.mjs";
import { inspectPrecharge } from "../tools/prepare-record.mjs";
import { reconcileTask } from "./reconcile-task.mjs";
import { DEFAULT_RPC } from "../../../tools/settlement.mjs";

const requireFact = (condition, reason) => {
  if (!condition) throw Error(reason + "; PaymentUnknown / NO RECHARGE");
};

/**
 * The local hint only locates a transaction. Actual payment classification
 * still comes from reconcileTask's signed-intent, task and independent RPC
 * Transfer + AuthorizationUsed verification. Finality is never inferred.
 */
export async function reconcileStoredHint({approval, paymentNonce, expectedPayTo}, deps = {}) {
  const typed = buildApprovalData(approval);
  const nonce = assertHex32(paymentNonce, "payment nonce");
  const payee = assertAddress(expectedPayTo, "approved payee");
  requireFact(payee === typed.message.payTo, "approved payee mismatch");
  requireFact(typeof approval.signature === "string" &&
    /^0x[0-9a-fA-F]{130}$/.test(approval.signature), "payer signature missing");
  const verifySignature = deps.verifySignature || verifyTypedData;
  requireFact(await verifySignature({
    address: typed.address, domain: typed.domain, types: typed.types,
    primaryType: typed.primaryType, message: typed.message,
    signature: approval.signature
  }), "payer signature invalid");

  // A historical approval may have expired since payment. Its expiry alone
  // does not prove whether settlement was authorized at the original time.
  const reservation = await (deps.inspectPrecharge || inspectPrecharge)(nonce);
  const row = reservation?.admission;
  const digest = hashTypedData({
    domain: typed.domain, types: typed.types,
    primaryType: typed.primaryType, message: typed.message,
  }).toLowerCase();
  requireFact(reservation?.result === "PRECHARGE_RECORD_FOUND" &&
    row?.status === "RESERVED_RECONCILE_ONLY" &&
    row.ledger === typed.domain.verifyingContract &&
    row.task_id === typed.message.taskId &&
    row.payer === typed.address &&
    row.approval_nonce === typed.message.nonce &&
    row.quote_digest === digest &&
    row.payment_nonce === nonce, "signed quote does not match durable reservation");

  const hint = reservation.unverifiedTransactionHint;
  requireFact(hint && hint.source === "UNVERIFIED_SETTLEMENT_CALLBACK",
    "no durable original transaction hint");
  requireFact(hint.payment_nonce === nonce &&
    hint.ledger === row.ledger &&
    hint.task_id === row.task_id &&
    hint.payer === row.payer, "transaction hint identity mismatch");
  const transaction = assertHex32(hint.transaction_hash, "unverified transaction hash");

  const expected = {
    schemaVersion: "agentledger.pending-x402.v1",
    network: "eip155:10143",
    taskId: typed.message.taskId,
    transaction,
    payer: typed.address,
    payTo: typed.message.payTo,
    token: typed.message.token,
    amountAtomic: typed.message.amountAtomic.toString(),
    paymentNonce: nonce,
  };
  // Pin both task and transaction reads to the same configured RPC.
  const rpcUrl = deps.rpcUrl ?? process.env.MONAD_RPC_URL ?? DEFAULT_RPC;
  const result = await (deps.reconcileTask || reconcileTask)({
    approval, pendingReceipt: expected, expectedPayTo: payee,
  }, {
    chain: deps.chain,
    readTask: deps.readTask,
    verifySettlement: deps.verifySettlement,
    verifySignature,
    settlementRpcUrl: rpcUrl,
    inspectPrecharge: () => reservation,
  });
  // The receipt verifier must preserve the original selected transaction.
  requireFact(assertHex32(result?.observedTransaction, "verified transaction") === transaction &&
    result.paymentNonce === nonce &&
    result.ledger === typed.domain.verifyingContract &&
    result.taskId === typed.message.taskId &&
    result.status === "READ_ONLY_NO_RECHARGE", "reconciled transaction identity mismatch");
  return {
    ...result,
    recoverySource: "UNVERIFIED_SETTLEMENT_CALLBACK",
    recoveryMode: "READ_ONLY_DURABLE_HINT",
    journalStatus: "RESERVED_RECONCILE_ONLY",
    chargeAgain: false,
    caveat: "The callback hash was only a lookup pointer. RPC inclusion is point-in-time, not finality. ACP owns execution; manual Recorder approval remains mandatory.",
  };
}
