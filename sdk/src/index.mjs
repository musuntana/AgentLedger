// SPDX-License-Identifier: Apache-2.0
/**
 * AgentLedger read-only SDK (private alpha). Public surface intentionally
 * limited to factory + immutable metadata. No wallet, fixture parser,
 * payment retries, write transport or ACP execution authority.
 *
 * Error contract v1: every SDK-thrown error has stable .code / .operation /
 * .retryable / .paymentStatus / .chargeAgain. No URL, signature, or receipt
 * payload is ever appended to a network error message.
 */
import { readTask, makeClient, CHAIN_ID, RPC, validateLookup } from "../../examples/verifier/lib/task-reader.mjs";
import { verifyEvidence, canonicalEvidence } from "../../examples/verifier/public/evidence-browser.mjs";
import { projectPhase0 } from "../../phase0/status.mjs";
import { verifyLive, NETWORK, USDC_CONTRACT } from "../../tools/settlement.mjs";

export const SDK_VERSION="0.2.0-alpha.3";
export const SDK_CAPABILITIES=Object.freeze({
  observe:true,verify:true,reconcile:true,readOnly:true,
  acceptPayment:false,charge:false,sign:false,mutateLedger:false,
  executeAgent:false,manageAcp:false,proveChainFinality:false,
});
const SDK_SCHEMA="agentledger.sdk.read-only.v1";
const NONCE=/^0x[0-9a-fA-F]{64}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const DECIMAL=/^[1-9][0-9]*$/;
const DENY_TRANSPORT="Injected transport/client is forbidden in public SDK; use rpcUrl. No receipt or charge attempted";
const MAX_SOURCE_BYTES=10*1024*1024; // Align with Studio's bounded local file reads.

function sdkError(code,operation,message,retryable=false) {
  const e=new Error(message);
  e.name="AgentLedgerSDKError";
  e.code=code;
  e.operation=operation;
  e.retryable=retryable; // retry ONLY read-only observation, NEVER charge
  e.paymentStatus="PaymentUnknown";
  e.chargeAgain=false;
  return e;
}
function requireInput(ok,operation,message) {
  if(!ok)throw sdkError("SDK_INVALID_INPUT",operation,message);
}
// SDK observations are evidence snapshots, not mutable client-owned state.
// Restrict this to plain JSON-like response objects (never ArrayBufferViews).
function freezeSnapshot(value) {
  if(value && typeof value==="object") {
    for(const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
function originalFilesCoverage(inputChecked,outputChecked) {
  return inputChecked && outputChecked ? "BOTH_MATCHED" :
    inputChecked || outputChecked ? "PARTIAL_MATCHED" : "NOT_SUPPLIED";
}
// Never retain caller-owned mutable BufferSource objects across awaited RPCs.
// The slice also respects a DataView/Buffer's byteOffset and byteLength.
function snapshotBytes(value,name) {
  if(value===null)return null;
  requireInput(value instanceof ArrayBuffer || ArrayBuffer.isView(value),
    "verify",name+" must be raw bytes");
  let bytes;
  try {
    bytes=value instanceof ArrayBuffer ? new Uint8Array(value) :
      new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    requireInput(bytes.byteLength<=MAX_SOURCE_BYTES,"verify",
      name+" exceeds 10 MiB local verification limit");
    return bytes.slice();
  } catch(error) {
    if(error?.name==="AgentLedgerSDKError")throw error;
    throw sdkError("SDK_INVALID_INPUT","verify",name+" has unavailable raw bytes");
  }
}
// Take one descriptor snapshot before validating it and awaiting RPC.
// Reject getters, non-enumerable overrides and inherited required fields.
function snapshotReceipt(expected) {
  const fields=new Set(["network","taskId","transaction","payer","payTo",
    "token","amountAtomic","paymentNonce"]);
  const keys=Reflect.ownKeys(expected);
  requireInput(keys.every(key=>typeof key==="string" && fields.has(key)),
    "reconcile","Unknown receipt descriptor field");
  const descriptors=Object.getOwnPropertyDescriptors(expected);
  requireInput(keys.every(key=>Object.hasOwn(descriptors[key],"value")),
    "reconcile","Receipt descriptor fields must be plain data");
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,descriptors[key].value])));
}
function safeRpcUrl(value){
  requireInput(typeof value==="string"&&value.length>0&&value.length<=2048,
    "create","rpcUrl must be a non-empty string");
  let url;
  try{url=new URL(value);}catch{throw sdkError("SDK_INVALID_RPC_URL","create","Invalid RPC URL");}
  const local=url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if((url.protocol!=="https:"&&!local) || url.username || url.password ||
     url.search || url.hash || (url.pathname!=="/" && url.pathname!=="")) {
    throw sdkError("SDK_INVALID_RPC_URL","create",
      "RPC must be HTTPS or local loopback; credentials, query and URL path are forbidden");
  }
  return url.origin;
}
function classifyFailure(error,operation) {
  if(error?.name==="AgentLedgerSDKError")return error;
  const message=String(error?.message??"");
  if(/wrong chain|RPC is not Monad Testnet/i.test(message))
    return sdkError("SDK_CHAIN_MISMATCH",operation,"RPC connected to wrong chain (expected 10143)");
  if(/SHA-256 mismatch|task ID does not match|not Proven|invalid on-chain task/i.test(message))
    return sdkError("SDK_EVIDENCE_MISMATCH",operation,"Evidence SHA-256 mismatch or task anchor unavailable");
  if(/Unexpected or missing Evidence|Invalid (completedAt|inputSha256|outputSha256|executor|modelOrTool|taskId)|Unsupported Evidence|Evidence must/i.test(message))
    return sdkError("SDK_INVALID_EVIDENCE",operation,"Invalid canonical Evidence payload");
  // Pending observations are safe to repeat ONLY as read-only queries.
  // A missing receipt or shallow confirmation count never proves nonpayment.
  if(operation==="reconcile" &&
    /transaction receipt missing|confirmation threshold not reached/i.test(message))
    return sdkError("SDK_SETTLEMENT_PENDING",operation,
      "Payment receipt pending or insufficient confirmations; PaymentUnknown, read-only recheck only",true);
  if(operation==="reconcile" &&
    /transaction hash mismatch|transaction reverted|expected exactly one matching|nonce|incorrect network|only official Monad Testnet USDC|receipt block is no longer canonical|canonical block height mismatch|receipt logs missing|log block mismatch|log transaction mismatch|unsafe logIndex|x402 .*mismatch/i.test(message))
    return sdkError("SDK_SETTLEMENT_INCONSISTENT",operation,
      "Receipt, USDC transfer, authorization nonce or canonical chain witness inconsistent; PaymentUnknown, do not recharge");
  if(/invalid contract address|invalid bytes32 task ID/i.test(message))
    return sdkError("SDK_INVALID_INPUT",operation,"Invalid Ledger contract or task ID");
  if(/no contract bytecode|invalid task state|invalid contract result/i.test(message))
    return sdkError("SDK_TASK_UNAVAILABLE",operation,"Ledger task unavailable or contract not deployed");
  return sdkError("SDK_OBSERVATION_UNAVAILABLE",operation,
    "Read-only RPC verification unavailable or inconsistent; PaymentUnknown, do not recharge",true);
}
async function observeSafely(operation,callback){
  try{return await callback();}catch(error){throw classifyFailure(error,operation);}
}
function verifyReceiptInput(expected,options){
  const op="reconcile";
  requireInput(expected!==null&&typeof expected==="object"&&!Array.isArray(expected),
    op,"Expected payment receipt descriptor required");
  // Only own primitive data fields reach the settlement verifier.
  // Validate the exact same immutable descriptor used by the RPC operation.
  const descriptor=snapshotReceipt(expected);
  requireInput(descriptor.network===NETWORK,op,"Expected network must be eip155:10143");
  requireInput(NONCE.test(descriptor.paymentNonce||""),op,
    "EIP-3009 paymentNonce required; PaymentUnknown, do not recharge");
  requireInput(NONCE.test(descriptor.taskId||"")&&NONCE.test(descriptor.transaction||""),
    op,"Expected bytes32 task ID and transaction hash");
  requireInput(ADDRESS.test(descriptor.payer||"")&&ADDRESS.test(descriptor.payTo||""),
    op,"Expected valid payer and payTo addresses");
  requireInput(descriptor.token===undefined ||
    (ADDRESS.test(descriptor.token||"")&&descriptor.token.toLowerCase()===USDC_CONTRACT.toLowerCase()),
    op,"Only official Monad Testnet USDC is supported");
  requireInput(typeof descriptor.amountAtomic==="string"&&DECIMAL.test(descriptor.amountAtomic),
    op,"Expected positive decimal amountAtomic");
  requireInput(options!==null&&typeof options==="object"&&!Array.isArray(options),
    op,"Receipt observation options must be an object");
  requireInput(Object.keys(options).every(k=>k==="minConfirmations"),
    op,"Unknown receipt observation option");
  const minConfirmations=options.minConfirmations??2;
  requireInput(Number.isInteger(minConfirmations)&&minConfirmations>=1&&
    minConfirmations<=1000,op,"Invalid confirmation policy (1..1000)");
  return {minConfirmations,descriptor};
}
/**
 * Create a read-only verifier. Caller-provided clients, fetch, transports,
 * signers or per-request RPC URLs are forbidden. Only a fixed HTTPS or
 * loopback RPC URL is accepted. No connection is opened at construction.
 */
export function createAgentLedgerVerifier(options={}) {
  if(!options || typeof options!=="object" || Array.isArray(options))
    throw sdkError("SDK_INVALID_OPTIONS","create","SDK options must be an object");
  // Deliberate order: reject injected transport before URL/nonce parsing.
  if(Object.keys(options).some(k=>["client","transport","fetch","request"].includes(k)))
    throw sdkError("SDK_TRANSPORT_FORBIDDEN","create",DENY_TRANSPORT);
  if(Object.keys(options).some(k=>k!=="rpcUrl"))
    throw sdkError("SDK_INVALID_OPTIONS","create","Unknown SDK option");
  const rpcUrl=safeRpcUrl(options.rpcUrl??RPC);
  const chain=makeClient(rpcUrl);
  return Object.freeze({
    sdkVersion:SDK_VERSION,
    capabilities:SDK_CAPABILITIES,
    async observe(contract,taskId){
      return observeSafely("observe",async()=>{
        validateLookup(contract,taskId);
        const task=await readTask(chain,contract,taskId);
        return freezeSnapshot({
          schemaVersion:SDK_SCHEMA,sdkVersion:SDK_VERSION,source:"RPC_READ_ONLY",
          task,status:projectPhase0({task,attempt:"NotEstablished"}),
          paymentStatus:"PaymentUnknown",paymentVerified:false,
          publicTestnetAcceptance:"BLOCKED_UNLESS_SEPARATELY_REVIEWED",
          finalityProven:false,chargeAgain:false,executionAuthority:"ACP",
        });
      });
    },
    async verify(contract,taskId,evidence,options={}){
      return observeSafely("verify",async()=>{
        validateLookup(contract,taskId);
        requireInput(options!==null&&typeof options==="object"&&!Array.isArray(options),
          "verify","Evidence verification options must be an object");
        requireInput(Object.keys(options).every(k=>k==="inputBytes"||k==="outputBytes"),
          "verify","Unknown Evidence verification option");
        const {inputBytes=null,outputBytes=null}=options;
        const inputSnapshot=snapshotBytes(inputBytes,"inputBytes");
        const outputSnapshot=snapshotBytes(outputBytes,"outputBytes");
        // Both canonical Evidence and optional source bytes are captured
        // synchronously before the first await. Never hash mutated caller
        // objects/bytes after observing a task through RPC.
        const canonical=canonicalEvidence(evidence);
        const evidenceSnapshot=JSON.parse(canonical);
        if(evidenceSnapshot.taskId!==taskId.toLowerCase())
          throw sdkError("SDK_EVIDENCE_MISMATCH","verify","Evidence task ID does not match the requested task");
        const task=await readTask(chain,contract,taskId);
        const matched=await verifyEvidence(evidenceSnapshot,task,inputSnapshot,outputSnapshot);
        return freezeSnapshot({
          ...matched,
          evidenceDigestMatched:true,
          originalFilesCoverage:originalFilesCoverage(matched.inputChecked,matched.outputChecked),
          schemaVersion:SDK_SCHEMA,sdkVersion:SDK_VERSION,
          source:"CHAIN_ANCHOR_PLUS_LOCAL_BYTES",evidenceHash:task.evidenceHash,
          paymentStatus:"PaymentUnknown",paymentVerified:false,
          finalityProven:false,chargeAgain:false,executionAuthority:"ACP",
          publicTestnetAcceptance:"BLOCKED_UNLESS_SEPARATELY_REVIEWED",
        });
      });
    },
    async reconcile(expected,options={}){
      return observeSafely("reconcile",async()=>{
        const {descriptor,minConfirmations}=verifyReceiptInput(expected,options); // BEFORE any network
        const payment=await verifyLive(descriptor,rpcUrl,fetch,{minConfirmations});
        return freezeSnapshot({
          schemaVersion:SDK_SCHEMA,sdkVersion:SDK_VERSION,source:"USDC_RECEIPT_ONLY",
          paymentEventObserved:true,nonce:payment.paymentNonce,
          transaction:payment.transaction,blockHash:payment.blockHash,
          settlementRef:payment.settlementRef,chainId:CHAIN_ID,
          // These are validated receipt/log facts and a point-in-time
          // canonical block witness, NOT a finality or task-intent proof.
          blockNumber:payment.blockNumber,
          observedHeadBlockNumber:payment.observedHeadBlockNumber,
          confirmationsAtObservation:payment.confirmations,
          logIndex:payment.logIndex,
          transactionIndex:payment.transactionIndex,
          canonicalBlockCheckedAtObservation:payment.canonicalBlockCheckedAtObservation,
          status:"PaymentUnknown",payerIntentVerified:false,
          prechargeReservationVerified:false,finalityProven:false,
          publicTestnetAcceptance:"BLOCKED_UNLESS_SEPARATELY_REVIEWED",
          chargeAgain:false,executionAuthority:"ACP",
          note:"Read-only Transfer + AuthorizationUsed observation. Signed intent and durable reservation require independent Phase 0 reconciliation.",
        });
      });
    },
  });
}
