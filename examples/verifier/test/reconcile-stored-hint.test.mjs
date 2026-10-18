// SPDX-License-Identifier: Apache-2.0
// Hermetic chain mock + real SQLite journal + real EIP-712 signing.
// Mock receipts prove wiring only; no test is public payment acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hashTypedData } from "viem";
import { buildApprovalData } from "../../../lib/approval-format.mjs";
import { inspectPrecharge } from "../tools/prepare-record.mjs";
import { reconcileStoredHint } from "../lib/reconcile-stored-hint.mjs";

const JOURNAL = new URL("../../../tools/charge-attempt-journal.py", import.meta.url).pathname;
const LEDGER = "0x" + "11".repeat(20);
const TASK = "0x" + "22".repeat(32);
const DESC = "0x" + "33".repeat(32);
const PAYEE = "0x" + "44".repeat(20);
const NONCE = "0x" + "55".repeat(32);
const TX = "0x" + "66".repeat(32);
const REF = "0x" + "77".repeat(32);
const ZERO = "0x" + "00".repeat(32);
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

async function scenario(t, {writeHint = true, reserveOverrides = {}, hintOverrides = {}} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agentledger-hint-"));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const db = join(dir, "charge.db");
  const signer = privateKeyToAccount(generatePrivateKey());
  const approval = {
    schemaVersion:"agentledger.task-payment.v1",chainId:10143,
    ledger:LEDGER,taskId:TASK,descriptionHash:DESC,
    token:USDC,payTo:PAYEE,payer:signer.address,amountAtomic:"1000",
    expiresAt:"1700000000",nonce:"0x" + "88".repeat(32),
  };
  const typed = buildApprovalData(approval);
  approval.signature = await signer.signTypedData({
    domain:typed.domain,types:typed.types,
    primaryType:typed.primaryType,message:typed.message
  });
  const quoteDigest = hashTypedData({
    domain:typed.domain,types:typed.types,
    primaryType:typed.primaryType,message:typed.message
  }).toLowerCase();
  const run = (command, value) => {
    const response = spawnSync("python3",[JOURNAL,command],{
      input:JSON.stringify(value),encoding:"utf8",timeout:10000,
      env:{...process.env,AGENTLEDGER_CHARGE_DB:db},
    });
    assert.equal(response.status,0,response.stderr);
    return JSON.parse(response.stdout);
  };
  run("reserve",{
    schemaVersion:"agentledger.precharge.v1",
    ledger:LEDGER,taskId:TASK,payer:signer.address.toLowerCase(),
    approvalNonce:approval.nonce,paymentNonce:NONCE,
    quoteDigest,payloadDigest:"0x" + "99".repeat(32),
    ...reserveOverrides
  });
  if (writeHint) run("attach-hint",{
    schemaVersion:"agentledger.tx-hint.v1",
    ledger:LEDGER,taskId:TASK,payer:signer.address.toLowerCase(),
    paymentNonce:NONCE,transaction:TX,...hintOverrides,
  });
  const reservation = () => inspectPrecharge(NONCE, {dbPath:db});
  const counts = {task:0,transfer:0};
  const task = {
    chainId:10143,contract:LEDGER,taskId:TASK,descriptionHash:DESC,
    status:"Created",maxBudgetAtomic:"1000",amountAtomic:"0",
    settlementRef:ZERO,payer:"0x" + "00".repeat(20),
  };
  const fakeTransfer = (expected) => ({
    taskId:TASK,network:"eip155:10143",transaction:expected.transaction,
    payer:signer.address.toLowerCase(),payTo:PAYEE,token:USDC,
    amountAtomic:"1000",paymentNonce:NONCE,settlementRef:REF,
    blockNumber:"1200",blockHash:ZERO,confirmations:"2",
    canonicalBlockCheckedAtObservation:true,
  });
  const deps = {
    chain:{},
    readTask:async()=>{counts.task++;return task;},
    inspectPrecharge:reservation,
    verifySettlement:async(expected,url)=>{
      counts.transfer++;
      assert.equal(url,"https://testnet-rpc.monad.xyz");
      return fakeTransfer(expected);
    },
    rpcUrl:"https://testnet-rpc.monad.xyz",
  };
  return {db,approval,task,counts,deps,args:{
    approval,paymentNonce:NONCE,expectedPayTo:PAYEE
  },reservation,fakeTransfer};
}

test("persisted callback hash reconstructs a read-only original payment lookup after restart",async t=>{
  const s = await scenario(t);
  const r = await reconcileStoredHint(s.args,s.deps);
  assert.equal(r.classification,"SETTLEMENT_OBSERVED_LEDGER_CREATED");
  assert.equal(r.status,"READ_ONLY_NO_RECHARGE");
  assert.equal(r.recoveryMode,"READ_ONLY_DURABLE_HINT");
  assert.equal(r.recoverySource,"UNVERIFIED_SETTLEMENT_CALLBACK");
  assert.equal(r.observedTransaction,TX);
  assert.equal(r.paymentNonce,NONCE);
  assert.equal(r.chargeAgain,false);
  assert.deepEqual(s.counts,{task:1,transfer:1});
  const again = await reconcileStoredHint(s.args,s.deps);
  assert.equal(again.classification,r.classification);
  assert.equal(s.reservation().admission.status,"RESERVED_RECONCILE_ONLY");
});

test("missing callback hint never fabricates payment or performs RPC",async t=>{
  const s=await scenario(t,{writeHint:false});
  await assert.rejects(reconcileStoredHint(s.args,s.deps),/no durable original transaction hint/);
  assert.deepEqual(s.counts,{task:0,transfer:0});
  assert.equal(s.reservation().paymentStatus,"PaymentUnknown");
});

test("signed quote or payee tamper blocks before local or remote observation",async t=>{
  const s=await scenario(t);
  const bad=[{...s.args,expectedPayTo:"0x"+"ee".repeat(20)},
    {...s.args,approval:{...s.approval,amountAtomic:"2000"}}];
  for(const input of bad){
    await assert.rejects(reconcileStoredHint(input,s.deps));
  }
  assert.deepEqual(s.counts,{task:0,transfer:0});
});

test("nonce, quote digest or ledger identity must match the original reservation",async t=>{
  const s=await scenario(t);
  const original=s.reservation();
  for(const patch of [
    {status:"UNKNOWN"},
    {quote_digest:ZERO},{ledger:"0x"+"aa".repeat(20)},
    {payment_nonce:ZERO},{approval_nonce:ZERO},
  ]){
    await assert.rejects(reconcileStoredHint(s.args,{
      ...s.deps,inspectPrecharge:()=>({
        ...original,admission:{...original.admission,...patch}
      })
    }),/signed quote does not match durable reservation/);
  }
  assert.deepEqual(s.counts,{task:0,transfer:0});
});

test("malformed or mismatched hint rejects before querying RPC",async t=>{
  const s=await scenario(t);
  const original=s.reservation();
  for(const patch of [
    {source:"TRUSTED_PAYMENT"},
    {ledger:"0x"+"aa".repeat(20)},
    {task_id:ZERO},{payment_nonce:ZERO},
    {transaction_hash:"evil"},
  ]){
    await assert.rejects(reconcileStoredHint(s.args,{
      ...s.deps,inspectPrecharge:()=>({
        ...original,unverifiedTransactionHint:{
          ...original.unverifiedTransactionHint,...patch
        }
      })
    }));
  }
  assert.deepEqual(s.counts,{task:0,transfer:0});
});

test("fabricated reconciler result cannot redirect to a different transaction",async t=>{
  const s=await scenario(t);
  await assert.rejects(reconcileStoredHint(s.args,{
    ...s.deps,
    reconcileTask:async()=>({
      observedTransaction:ZERO,paymentNonce:NONCE,ledger:LEDGER,
      taskId:TASK,status:"READ_ONLY_NO_RECHARGE"
    })
  }),/reconciled transaction identity mismatch/);
});

test("wrong chain, mismatched USDC amount, wrong nonce and RPC outages remain unknown",async t=>{
  const s=await scenario(t);
  for(const taskPatch of [{chainId:1},{descriptionHash:ZERO}]){
    await assert.rejects(reconcileStoredHint(s.args,{
      ...s.deps,readTask:async()=>({...s.task,...taskPatch})
    }));
  }
  for(const changed of [{amountAtomic:"900"},{paymentNonce:ZERO}]){
    await assert.rejects(reconcileStoredHint(s.args,{
      ...s.deps,verifySettlement:async expected=>({...s.fakeTransfer(expected),...changed})
    }));
  }
  await assert.rejects(reconcileStoredHint(s.args,{
    ...s.deps,verifySettlement:async()=>{throw Error("RPC unavailable")}
  }),/RPC unavailable/);
  assert.equal(s.reservation().admission.status,"RESERVED_RECONCILE_ONLY");
});

test("deleted precharge DB remains unavailable without recreating a journal",async t=>{
  const s=await scenario(t);
  const {existsSync,unlinkSync}=await import("node:fs");
  // Cleanly close the Python CLI, then remove the DB and prevent recovery.
  unlinkSync(s.db);
  assert.equal(existsSync(s.db),false);
  await assert.rejects(reconcileStoredHint(s.args,s.deps),/unreadable pre-charge reservation/);
  assert.equal(existsSync(s.db),false);
});

test("recovery CLI limits approval inputs and never echoes sensitive paths",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"agentledger-cli-bound-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const {writeFileSync}=await import("node:fs");
  const large=join(dir,"secret-approved-payload.json");
  writeFileSync(large,"x".repeat(2*1024*1024+1));
  const cli=new URL("../tools/reconcile-hint.mjs",import.meta.url).pathname;
  for(const file of [large,join(dir,"SECRET_NONEXISTENT.json")]){
    const result=spawnSync(process.execPath,[cli,file,NONCE,PAYEE],{
      encoding:"utf8",timeout:10000
    });
    assert.equal(result.status,2);
    assert.match(result.stderr,/UNKNOWN_NO_RECHARGE/);
    assert.equal(result.stdout,"");
    assert.equal(result.stderr.includes(file),false);
    assert.equal(result.stderr.includes("SECRET_NONEXISTENT"),false);
  }
});
