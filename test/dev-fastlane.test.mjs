// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, statSync, readFileSync, rmSync, mkdirSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { runDevObservation } from "../examples/verifier/lib/dev-observation.mjs";
import { createDevWallet } from "../tools/testnet-dev-wallet.mjs";

const request={schemaVersion:"agentledger.dev-observe.v1",
  chainId:10143,ledger:"0x"+"11".repeat(20),taskId:"0x"+"22".repeat(32),
  attempt:"Reserved"};

test("DEV observation permits unreviewed Testnet address but NEVER labels it release-accepted",async()=>{
  let called=0;
  const result=await runDevObservation(request,{inspect:async q=>{
    called++;
    assert.equal(q.schemaVersion,"agentledger.phase0.inspect.v1");
    assert.equal(q.attempt,"Reserved");
    return {state:"PaymentUnknown",inspection:{chainDiagnostic:"CHAIN_READ_UNAVAILABLE"}};
  }});
  assert.equal(called,1);
  assert.equal(result.mode,"DEV_TESTNET_ONLY");
  assert.equal(result.publicAcceptance,false);
  assert.equal(result.releaseGateBypassed,false);
  assert.equal(result.finalityProven,false);
  assert.equal(result.chargeAgain,false);
  assert.equal(result.paymentState,"PaymentUnknown");
});

test("DEV request refuses wrong network, fake context and unsupported NotStarted",async()=>{
  for(const override of [{chainId:1},{ledger:"wrong"},{taskId:"bad"},
    {attempt:"NotStarted"},{schemaVersion:"agentledger.phase0.live-acceptance.v1"}]) {
    await assert.rejects(runDevObservation({...request,...override},{inspect:async()=>({state:"PaymentUnknown"})}),/DEV_OBSERVATION_INVALID_REQUEST/);
  }
  await assert.rejects(runDevObservation(request,{inspect:async()=>({state:"PASS_PUBLIC_ACCEPTANCE"})}),/UNSUPPORTED_PROJECTION/);
});

test("throwaway wallet CLI writes a private file outside repo and never prints the secret",()=>{
  const home=mkdtempSync(join(tmpdir(),"agentledger-wallet-fixture-"));
  try {
    const runner=spawnSync(process.execPath,["tools/testnet-dev-wallet.mjs"],{
      cwd:new URL("../",import.meta.url).pathname,
      encoding:"utf8",env:{...process.env,HOME:home},timeout:10000,
    });
    assert.equal(runner.status,0,runner.stderr);
    const file=join(home,".config","agentledger","dev-wallets");
    assert.ok(existsSync(file));
    const path=runner.stdout.match(/Private key stored locally \(NOT PRINTED\): (.+)/)?.[1]?.trim();
    assert.ok(path?.startsWith(file));
    const secret=JSON.parse(readFileSync(path,"utf8"));
    assert.equal(secret.chainId,10143);
    assert.equal(secret.address,privateKeyToAccount(secret.privateKey).address);
    assert.equal(statSync(path).mode & 0o777,0o600);
    assert.equal(statSync(file).mode & 0o777,0o700);
    assert.equal(runner.stdout.includes(secret.privateKey),false);
    assert.equal(runner.stderr.includes(secret.privateKey),false);
  } finally { rmSync(home,{recursive:true,force:true}); }
});

test("throwaway wallet refuses symlinked developer storage instead of writing through it",()=>{
  const home=mkdtempSync(join(tmpdir(),"agentledger-wallet-symlink-"));
  try {
    const outside=join(home,"outside");
    mkdirSync(join(home,".config"));
    mkdirSync(outside);
    symlinkSync(outside,join(home,".config","agentledger"));
    assert.throws(()=>createDevWallet({home}),/Unsafe developer wallet storage path/);
    assert.deepEqual(readdirSync(outside),[]);
  }finally {rmSync(home,{recursive:true,force:true});}
});
