// SPDX-License-Identifier: Apache-2.0
// DEV-only read-only Monad Testnet observation, intentionally NOT public acceptance.
// Use the ordinary Phase 0 verifier; never weaken the reviewed-deployment release gate.
import { inspectPhase0 } from "./phase0-inspect.mjs";
const ADDR=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;

export function validateDevRequest(req) {
  if(!req || req.schemaVersion!=="agentledger.dev-observe.v1" ||
     req.chainId!==10143 || !ADDR.test(req.ledger||"") ||
     !HASH.test(req.taskId||"") ||
     !["Reserved","NotEstablished"].includes(req.attempt||"NotEstablished")) {
    throw Error("DEV_OBSERVATION_INVALID_REQUEST");
  }
  return req;
}

export async function runDevObservation(request,{inspect=inspectPhase0}={}) {
  validateDevRequest(request);
  const phase0={
    schemaVersion:"agentledger.phase0.inspect.v1",
    ledger:request.ledger,taskId:request.taskId,
    attempt:request.attempt||"NotEstablished",
    ...(request.payment?{payment:request.payment}:{}),
    ...(request.evidence?{evidence:request.evidence}:{})
  };
  const observation=await inspect(phase0);
  // Do not let injected results or unsupported states masquerade as useful evidence.
  if(!observation || !["Created","PaymentUnknown","PaymentObserved",
      "PaymentRecorded","EvidenceAnchored","Conflict"].includes(observation.state)) {
    throw Error("DEV_OBSERVATION_UNSUPPORTED_PROJECTION");
  }
  return {
    schemaVersion:"agentledger.dev-observation.v1",
    mode:"DEV_TESTNET_ONLY",
    claim:"OBSERVATION_ONLY_NOT_PUBLIC_ACCEPTANCE",
    chainId:10143,
    ledger:request.ledger.toLowerCase(),
    taskId:request.taskId.toLowerCase(),
    reviewedDeploymentRequired:false,
    publicAcceptance:false,
    releaseGateBypassed:false,
    walletKeysUsed:false,
    contractWritesPerformed:false,
    finalityProven:false,
    serviceDeliveryProven:false,
    chargeAgain:false,
    paymentState:observation.state,
    observation,
    caveat:"DEV observation does not assert deployment review, payment finality, production readiness, or Agent execution correctness."
  };
}
