// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoCase } from "../public/demo-scenarios.mjs";
import { makeSummary } from "../public/summary.mjs";
import { observationMetrics, verificationMatrix } from "../public/verdict-matrix.mjs";

const tx = "0x" + "af".repeat(32);
const block = "0x" + "bc".repeat(32);
test("simulation cannot claim RPC performance, receipt, or settled funds", async () => {
  const fixture = await buildDemoCase("proven");
  const matrix = verificationMatrix({ task: fixture.task, verification: "HASH_MATCHED" });
  assert.equal(matrix.find(x => x.id === "task").state, "SIMULATED_ONLY");
  assert.equal(matrix.find(x => x.id === "evidence").state, "LOCAL_HASH_MATCH");
  assert.equal(matrix.find(x => x.id === "payment").state, "PAYMENT_UNKNOWN");
  assert.equal(matrix.find(x => x.id === "finality").state, "NOT_VERIFIED");
  const summary = makeSummary(fixture.task, {
    simulation: true, verification: "HASH_MATCHED",
    observation: { readPathLatencyMs: 17, creation: { state: "CONFIRMED", transactionHash: tx, blockHash: block, blockNumber: "3" } }
  });
  assert.equal(summary.metrics.readPathLatencyMs, null);
  assert.equal(summary.metrics.creationReceiptBlockNumber, null);
  assert.equal(summary.metrics.paymentToEvidenceBlockSpan, null);
  assert.equal(summary.rpc.contacted, false);
  assert.equal(summary.payment.chargeAgain, false);
  assert.equal(summary.boundaries.finalityProven, false);
});

test("a confirmed creation receipt does not certify payment or finality", async () => {
  const fixture = await buildDemoCase("proven");
  const creation = { state: "CONFIRMED", transactionHash: tx, blockHash: block, blockNumber: "801" };
  const report = makeSummary(fixture.task, {
    simulation: false, verification: "HASH_MATCHED",
    observation: { observedAt: "2026-10-17T10:00:00.000Z", readPathLatencyMs: 132.7, creation }
  });
  assert.equal(report.metrics.readPathLatencyMs, 133);
  assert.equal(report.metrics.creationReceiptBlockNumber, "801");
  assert.equal(report.metrics.creationReceiptBlockHash, block);
  assert.equal(report.metrics.paymentToEvidenceBlockSpan, null);
  assert.equal(report.metrics.writeGasUsedWei, null);
  assert.equal(report.observation.creationReceiptChecked, true);
  assert.equal(report.observation.creationTransaction, tx);
  assert.equal(report.payment.observedState, "PaymentUnknown");
  assert.equal(report.boundaries.publicTestnetAcceptance, "BLOCKED_NO_REVIEWED_DEPLOYMENT");
  const matrix = verificationMatrix({ simulation: false, task: fixture.task, verification: "HASH_MATCHED", creation });
  assert.equal(matrix[0].state, "CREATION_RECEIPT_MATCHED");
  assert.equal(matrix[2].state, "HASH_MATCH_NOT_EXECUTION");
  assert.equal(matrix[3].state, "NOT_VERIFIED");
});

test("unconfirmed or malformed receipts stay null; tamper is not a successful proof", async () => {
  const fixture = await buildDemoCase("proven");
  for (const creation of [null, {state:"PENDING",transactionHash:tx,blockHash:block,blockNumber:"4"},
    {state:"CONFIRMED",transactionHash:tx,blockHash:"bad",blockNumber:"4"}]) {
    const metrics = observationMetrics({simulation:false,readPathLatencyMs:Infinity,creation});
    assert.equal(metrics.creationReceiptBlockNumber,null);
    assert.equal(metrics.readPathLatencyMs,null);
  }
  const matrix = verificationMatrix({task: fixture.task, verification: "TAMPER_REJECTED"});
  assert.equal(matrix[2].state, "TAMPER_REJECTED");
  assert.equal(matrix[1].state, "PAYMENT_UNKNOWN");
});
