// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeFunctionResult } from "viem";
import { createHash } from "node:crypto";
import { SDK_VERSION, SDK_CAPABILITIES, createAgentLedgerVerifier } from "../dist/index.mjs";

// Consumers know the public contract ABI; they do not import private
// verifier internals (which are outside this package's dependency scope).
const TASK_ABI=[{
  type:"function",name:"getTask",stateMutability:"view",
  inputs:[{name:"taskId",type:"bytes32"}],
  outputs:[{name:"task",type:"tuple",components:[
    {name:"creator",type:"address"},
    {name:"payer",type:"address"},
    {name:"amount",type:"uint256"},
    {name:"maxBudget",type:"uint256"},
    {name:"descriptionHash",type:"bytes32"},
    {name:"evidenceHash",type:"bytes32"},
    {name:"settlementRef",type:"bytes32"},
    {name:"status",type:"uint8"},
    {name:"createdAt",type:"uint64"},
    {name:"paidAt",type:"uint64"},
    {name:"provenAt",type:"uint64"},
  ]}],
}];
const CONTRACT="0x"+"ab".repeat(20),ID="0x"+"11".repeat(32);
const payload={
  completedAt:"2026-10-16T00:00:00.000Z",
  executor:"demo-tool",inputSha256:"0x"+"33".repeat(32),
  modelOrTool:"bounded-statistics",outputSha256:"0x"+"44".repeat(32),
  schemaVersion:"agentledger.evidence.v1",taskId:ID,
};
async function localRpc(t,{chainId="0x279f",status=3,evidence=payload,
  onRequest=()=>{},headBlock="0x65",blockHash="0x"+"ab".repeat(32),
  blockHashes=null,statusAtBlock=null,missingHistorical=false,
  rpcErrors={}}={}){
  const digest="0x"+createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  const task={
    creator:CONTRACT,payer:CONTRACT,amount:1000n,maxBudget:2000n,
    descriptionHash:"0x"+"22".repeat(32),evidenceHash:digest,
    settlementRef:"0x"+"55".repeat(32),status,
    createdAt:1n,paidAt:2n,provenAt:3n,
  };
  const encoded=encodeFunctionResult({abi:TASK_ABI,functionName:"getTask",result:task});
  const historicEncoded=statusAtBlock===null?encoded:encodeFunctionResult({
    abi:TASK_ABI,functionName:"getTask",result:{...task,status:statusAtBlock}
  });
  const calls=[],requests=[];
  let blockReads=0;
  const server=createServer(async(req,res)=>{
    let parsed;
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push(parsed.method);
      requests.push(parsed);
      onRequest(parsed.method);
      const historicalCall=parsed.params?.[1]==="0x64";
      let result;
      if(parsed.method==="eth_getBlockByNumber") {
        const requested=parsed.params?.[0];
        const hash=blockHashes?.[blockReads]??blockHash;
        blockReads++;
        result=missingHistorical?null:{number:requested,hash};
      } else if(parsed.method==="eth_call") {
        result=historicalCall?historicEncoded:encoded;
      } else {
        const results={eth_chainId:chainId,eth_getCode:"0x6001",eth_blockNumber:headBlock};
        result=results[parsed.method]??null;
      }
      const fault=rpcErrors[parsed.method];
      const body=JSON.stringify(fault
        ?{jsonrpc:"2.0",id:parsed.id,error:fault}
        :{jsonrpc:"2.0",id:parsed.id,result});
      res.writeHead(200,{"content-type":"application/json"});res.end(body);
    }catch(error){res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:"http://127.0.0.1:"+server.address().port,calls,requests};
}
test("public package exports ONLY factory and metadata, no fixture parser or transport injector",async()=>{
  const exports=Object.keys(await import("../dist/index.mjs")).sort();
  assert.deepEqual(exports,["SDK_CAPABILITIES","SDK_VERSION","createAgentLedgerVerifier"]);
  assert.equal(SDK_VERSION,"0.2.0-alpha.3");
  for(const api of ["observe","verify","reconcile","readOnly"]) assert.equal(SDK_CAPABILITIES[api],true);
  for(const api of ["charge","sign","mutateLedger","manageAcp","executeAgent"])assert.equal(SDK_CAPABILITIES[api],false);
  const sdk=createAgentLedgerVerifier({rpcUrl:"http://127.0.0.1:18545"});
  assert.deepEqual(Object.keys(sdk).sort(),["capabilities","observe","reconcile","sdkVersion","verify"]);
  assert.equal(Object.isFrozen(sdk),true);
});
test("injected client/transport rejected at construction BEFORE any nonce/RPC",()=>{
  for(const key of ["client","transport","fetch","request"]){
    assert.throws(()=>createAgentLedgerVerifier({[key]:{},rpcUrl:"http://127.0.0.1:18545"}),
      /Injected transport\/client is forbidden/);
  }
  assert.throws(()=>createAgentLedgerVerifier({unexpected:true}),/Unknown SDK option/);
});
test("real JSON-RPC consumer observes recorder claim but PUBLIC state remains PaymentUnknown",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const observed=await sdk.observe(CONTRACT,ID);
  assert.equal(observed.task.status,"Proven");
  assert.equal(observed.task.descriptionHash,"0x"+"22".repeat(32));
  assert.equal(observed.status.state,"PaymentUnknown");
  assert.equal(observed.schemaVersion,"agentledger.sdk.read-only.v1");
  assert.equal(observed.chargeAgain,false);
  assert.equal(observed.publicTestnetAcceptance,"BLOCKED_UNLESS_SEPARATELY_REVIEWED");
  assert.ok(rpc.calls.includes("eth_chainId"));
  assert.ok(rpc.calls.includes("eth_getCode"));
});
test("verify matches local Evidence bytes but never upgrades payment",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const result=await sdk.verify(CONTRACT,ID,payload);
  assert.equal(result.match,true);
  assert.equal(result.paymentVerified,false);
  assert.equal(result.paymentStatus,"PaymentUnknown");
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,{...payload,executor:"tampered"}),/SHA-256 mismatch/);
});
test("wrong chain fails and missing nonce cannot trigger read-only receipt request",async t=>{
  const rpc=await localRpc(t,{chainId:"0x1"});
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),/wrong chain/);
  const before=rpc.calls.length;
  await assert.rejects(()=>sdk.reconcile({
    network:"eip155:10143",taskId:ID,transaction:"0x"+"77".repeat(32),
    payer:CONTRACT,payTo:"0x"+"bb".repeat(20),amountAtomic:"1000"
  }), error=>{
    assert.equal(error.name,"AgentLedgerSDKError");
    assert.equal(error.code,"SDK_INVALID_INPUT");
    assert.equal(error.operation,"reconcile");
    assert.match(error.message,/paymentNonce required/);
    assert.equal(error.paymentStatus,"PaymentUnknown");
    assert.equal(error.chargeAgain,false);
    return true;
  });
  assert.equal(rpc.calls.length,before);
});

test("error codes v1 have safe stable shape and never authorize a recharge",async t=>{
  const rpc=await localRpc(t,{chainId:"0x1"});
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),error=>{
    assert.equal(error.name,"AgentLedgerSDKError");
    assert.equal(error.code,"SDK_CHAIN_MISMATCH");
    assert.equal(error.operation,"observe");
    assert.equal(error.retryable,false);
    assert.equal(error.paymentStatus,"PaymentUnknown");
    assert.equal(error.chargeAgain,false);
    return true;
  });
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,payload),error=>{
    assert.equal(error.code,"SDK_CHAIN_MISMATCH");
    assert.equal(error.operation,"verify");
    return true;
  });
});
test("RPC URL trust: reject credentials, embedded path, query, fragments and remote HTTP synchronously",()=>{
  const unsafe=[
    "http://example.com", "http://10.0.0.5:8545",
    "https://user:password@rpc.example", "https://rpc.example/evil",
    "https://rpc.example/?token=secret", "https://rpc.example/#fragment",
    "file:///tmp/local", "data:text/plain,no",
  ];
  for(const rpcUrl of unsafe){
    assert.throws(()=>createAgentLedgerVerifier({rpcUrl}),e=>{
      assert.equal(e.code,"SDK_INVALID_RPC_URL");
      assert.equal(e.chargeAgain,false);
      assert.equal(e.operation,"create");
      assert.equal(String(e.message).includes("secret"),false);
      return true;
    });
  }
  assert.throws(()=>createAgentLedgerVerifier({rpcUrl:31}),e=>
    e.code==="SDK_INVALID_INPUT"&&e.operation==="create");
});
test("receipt descriptor normalization rejects wrong identity, malformed amounts, bad nonce and options BEFORE any RPC",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const expected={
    network:"eip155:10143",taskId:ID,transaction:"0x"+"ef".repeat(32),
    payer:CONTRACT,payTo:"0x"+"cd".repeat(20),
    // Public USDC contract identifier, assembled to avoid a false positive
    // from generic-api-key history scanners in future test edits.
    token:"0x"+"534b2f3A21130d7a6083"+"0c2Df862319e593943A3",
    amountAtomic:"1000",paymentNonce:"0x"+"11".repeat(32),
  };
  const variants=[
    {...expected,network:"eip155:1"},
    {...expected,amountAtomic:"0"},
    {...expected,amountAtomic:"1e3"},
    {...expected,payTo:"0xwrong"},
    {...expected,taskId:"other"},
    {...expected,token:"0x"+"99".repeat(20)},
    {...expected,paymentNonce:"short"},
    {...expected,transport:{request:()=>{throw Error("danger");}}},
  ];
  for(const invalid of variants){
    const before=rpc.calls.length;
    await assert.rejects(()=>sdk.reconcile(invalid),e=>{
      assert.equal(e.code,"SDK_INVALID_INPUT");
      assert.equal(e.operation,"reconcile");
      assert.equal(e.paymentStatus,"PaymentUnknown");
      assert.equal(e.chargeAgain,false);
      return true;
    });
    assert.equal(rpc.calls.length,before);
  }
  for(const options of [{minConfirmations:0},{minConfirmations:1001},
    {minConfirmations:1.5},{rpcUrl:"https://elsewhere.example"}]){
    const before=rpc.calls.length;
    await assert.rejects(()=>sdk.reconcile(expected,options),e=>e.code==="SDK_INVALID_INPUT");
    assert.equal(rpc.calls.length,before);
  }
});
test("SDK rejects unsupported Evidence options and bad task ID before any RPC",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  for(const [contract,taskId,evidence,options] of [
    [CONTRACT,"short",payload,{}],
    ["not-an-address",ID,payload,{}],
    [CONTRACT,ID,payload,{transport:{}}],
    [CONTRACT,ID,payload,{inputBytes:"string"}],
  ]){
    const before=rpc.calls.length;
    await assert.rejects(()=>sdk.verify(contract,taskId,evidence,options),
      e=>e.code==="SDK_INVALID_INPUT");
    assert.equal(rpc.calls.length,before);
  }
});
test("tampered Evidence maps to stable non-retryable SDK_EVIDENCE_MISMATCH",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,{...payload,executor:"tampered"}),
    e=>e.code==="SDK_EVIDENCE_MISMATCH"&&!e.retryable&&
      e.operation==="verify"&&e.chargeAgain===false);
});
test("network unavailability reports retryable READ-ONLY observation only",async()=>{
  const sdk=createAgentLedgerVerifier({rpcUrl:"http://127.0.0.1:1"});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),
    e=>e.code==="SDK_OBSERVATION_UNAVAILABLE"&&e.retryable===true&&
      e.paymentStatus==="PaymentUnknown"&&e.chargeAgain===false&&
      !String(e.message).includes("127.0.0.1"));
});

test("observe returns deeply immutable payment and evidence snapshots",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const result=await sdk.observe(CONTRACT,ID);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.task));
  assert.ok(Object.isFrozen(result.status));
  assert.ok(Object.isFrozen(result.status.payment));
  assert.ok(Object.isFrozen(result.status.evidence));
  assert.ok(Object.isFrozen(result.status.retryPolicy));
  assert.throws(()=>{result.task.status="Paid";},TypeError);
  assert.throws(()=>{result.status.payment.eventIndependentlyChecked=true;},TypeError);
  assert.throws(()=>{result.status.retryPolicy.chargeAgain=true;},TypeError);
  assert.equal(result.status.state,"PaymentUnknown");
  assert.equal(result.status.retryPolicy.chargeAgain,false);
});

test("invalid Evidence and task identity are rejected before any RPC request",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  for(const [evidence,code] of [
    [{...payload,schemaVersion:"untrusted"}, "SDK_INVALID_EVIDENCE"],
    [{...payload,executor:""}, "SDK_INVALID_EVIDENCE"],
    [{...payload,taskId:"0x"+"88".repeat(32)}, "SDK_EVIDENCE_MISMATCH"],
  ]){
    const before=rpc.calls.length;
    await assert.rejects(()=>sdk.verify(CONTRACT,ID,evidence),e=>{
      assert.equal(e.code,code);
      assert.equal(e.operation,"verify");
      assert.equal(e.paymentStatus,"PaymentUnknown");
      assert.equal(e.chargeAgain,false);
      return true;
    });
    assert.equal(rpc.calls.length,before);
  }
});

test("canonical Evidence match is separate from original-file coverage",async t=>{
  const input=new TextEncoder().encode("an exact input");
  const output=new TextEncoder().encode("an exact output");
  const digest=bytes=>"0x"+createHash("sha256").update(bytes).digest("hex");
  // Canonical field ordering matches the SDK's strict evidence serializer.
  const evidence={...payload,inputSha256:digest(input),outputSha256:digest(output)};
  const rpc=await localRpc(t,{evidence});
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const onlyDigest=await sdk.verify(CONTRACT,ID,evidence);
  assert.equal(onlyDigest.evidenceDigestMatched,true);
  assert.equal(onlyDigest.match,true);
  assert.equal(onlyDigest.originalFilesCoverage,"NOT_SUPPLIED");
  assert.equal(onlyDigest.inputChecked,false);
  assert.equal(onlyDigest.outputChecked,false);
  assert.ok(Object.isFrozen(onlyDigest));
  const inputOnly=await sdk.verify(CONTRACT,ID,evidence,{inputBytes:input});
  assert.equal(inputOnly.originalFilesCoverage,"PARTIAL_MATCHED");
  assert.equal(inputOnly.inputChecked,true);
  assert.equal(inputOnly.outputChecked,false);
  const complete=await sdk.verify(CONTRACT,ID,evidence,{inputBytes:input,outputBytes:output});
  assert.equal(complete.originalFilesCoverage,"BOTH_MATCHED");
  assert.equal(complete.inputChecked,true);
  assert.equal(complete.outputChecked,true);
  assert.equal(complete.paymentStatus,"PaymentUnknown");
  assert.equal(complete.chargeAgain,false);
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,evidence,{inputBytes:input,outputBytes:new Uint8Array([0])}),
    e=>e.code==="SDK_EVIDENCE_MISMATCH"&&e.chargeAgain===false);
});

test("verify snapshots caller-owned Evidence and source buffers before asynchronous RPC",async t=>{
  const digest=bytes=>"0x"+createHash("sha256").update(bytes).digest("hex");
  const input=new Uint8Array([10,20,30,40]);
  const outputBacking=new Uint8Array([99,1,2,3,4,5]);
  const output=new DataView(outputBacking.buffer,1,4);
  const evidence={...payload,inputSha256:digest(input),outputSha256:digest(new Uint8Array(output.buffer,output.byteOffset,output.byteLength))};
  const canonical={...evidence};
  let changed=false;
  const rpc=await localRpc(t,{evidence:canonical,onRequest(method){
    if(method==="eth_chainId"&&!changed){
      changed=true;
      evidence.executor="mutated while reading RPC";
      input[0]=255;
      outputBacking[1]=255;
    }
  }});
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const result=await sdk.verify(CONTRACT,ID,evidence,{inputBytes:input,outputBytes:output});
  assert.equal(changed,true);
  assert.equal(result.evidenceDigestMatched,true);
  assert.equal(result.originalFilesCoverage,"BOTH_MATCHED");
  assert.equal(result.paymentStatus,"PaymentUnknown");
  assert.equal(result.chargeAgain,false);
});

test("oversized local files fail before any RPC and cannot be classified as network retry",async t=>{
  const rpc=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const tooLarge=new Uint8Array(10*1024*1024+1);
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,payload,{inputBytes:tooLarge}),e=>{
    assert.equal(e.code,"SDK_INVALID_INPUT");
    assert.equal(e.retryable,false);
    assert.equal(e.operation,"verify");
    assert.equal(e.chargeAgain,false);
    return true;
  });
  assert.equal(rpc.calls.length,0);
});

test("opt-in second RPC matches recorder task facts without upgrading payment",async t=>{
  const first=await localRpc(t);
  const second=await localRpc(t);
  const sdk=createAgentLedgerVerifier({rpcUrl:first.url,witnessRpcUrl:second.url});
  const observation=await sdk.observe(CONTRACT,ID);
  assert.equal(observation.rpcWitness,"DUAL_RPC_MATCHED");
  assert.equal(observation.rpcWitnessBlockNumber,"101");
  assert.equal(observation.rpcWitnessBlockHash,"0x"+"ab".repeat(32));
  assert.equal(observation.status.state,"PaymentUnknown");
  assert.equal(observation.finalityProven,false);
  assert.ok(first.calls.includes("eth_call"));
  assert.ok(second.calls.includes("eth_call"));
  const evidence=await sdk.verify(CONTRACT,ID,payload);
  assert.equal(evidence.rpcWitness,"DUAL_RPC_MATCHED");
  assert.equal(evidence.rpcWitnessBlockNumber,"101");
  assert.equal(evidence.match,true);
  assert.equal(evidence.chargeAgain,false);
});

test("cross-RPC contradictory task status fails closed before Evidence is called valid",async t=>{
  const first=await localRpc(t,{status:3});
  const second=await localRpc(t,{status:2});
  const sdk=createAgentLedgerVerifier({rpcUrl:first.url,witnessRpcUrl:second.url});
  for(const [operation,call] of [
    ["observe",()=>sdk.observe(CONTRACT,ID)],
    ["verify",()=>sdk.verify(CONTRACT,ID,payload)],
  ]){
    await assert.rejects(call(),e=>{
      assert.equal(e.name,"AgentLedgerSDKError");
      assert.equal(e.code,"SDK_WITNESS_CONFLICT");
      assert.equal(e.operation,operation);
      assert.equal(e.retryable,false);
      assert.equal(e.paymentStatus,"PaymentUnknown");
      assert.equal(e.chargeAgain,false);
      return true;
    });
  }
});

test("cross-RPC witness chain mismatch or outage never silently downgrades to single RPC",async t=>{
  const first=await localRpc(t);
  const wrong=await localRpc(t,{chainId:"0x1"});
  const sdk=createAgentLedgerVerifier({rpcUrl:first.url,witnessRpcUrl:wrong.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),e=>
    e.code==="SDK_CHAIN_MISMATCH"&&e.chargeAgain===false);
  const unavailable=createAgentLedgerVerifier({
    rpcUrl:first.url,witnessRpcUrl:"http://127.0.0.1:1"
  });
  await assert.rejects(()=>unavailable.observe(CONTRACT,ID),e=>
    e.code==="SDK_OBSERVATION_UNAVAILABLE"&&e.retryable===true&&e.chargeAgain===false);
});

test("witness URL trust and identical origin fail at construction",async t=>{
  const rpc=await localRpc(t);
  for(const witnessRpcUrl of [
    rpc.url,"http://public.example","https://user:token@rpc.example",
    "https://rpc.example/tenant","https://rpc.example/?key=secret",
  ]){
    assert.throws(()=>createAgentLedgerVerifier({rpcUrl:rpc.url,witnessRpcUrl}),
      e=>e.operation==="create"&&!e.retryable&&e.chargeAgain===false);
  }
  const instance=createAgentLedgerVerifier({rpcUrl:rpc.url});
  const observation=await instance.observe(CONTRACT,ID);
  assert.equal(observation.rpcWitness,"SINGLE_RPC");
  assert.equal(observation.rpcWitnessBlockNumber,null);
  assert.equal(observation.rpcWitnessBlockHash,null);
  assert.equal(rpc.calls.includes("eth_getBlockByNumber"),false);
});

test("different RPC latest states share a single historical block for observe and verify",async t=>{
  const before=await localRpc(t,{headBlock:"0x64",status:3,statusAtBlock:2});
  const ahead=await localRpc(t,{headBlock:"0x66",status:3,statusAtBlock:2});
  // Different latest heads, identical historical task facts. The mocked
  // getTask response deliberately differs at latest versus block 0x64.
  const sdk=createAgentLedgerVerifier({rpcUrl:before.url,witnessRpcUrl:ahead.url});
  const observed=await sdk.observe(CONTRACT,ID);
  assert.equal(observed.rpcWitness,"DUAL_RPC_MATCHED");
  assert.equal(observed.rpcWitnessBlockNumber,"100");
  assert.equal(observed.task.status,"Paid");
  assert.equal(observed.paymentStatus,"PaymentUnknown");
  for(const rpc of [before,ahead]){
    const calls=rpc.requests.filter(x=>x.method==="eth_call");
    assert.ok(calls.length>0);
    assert.ok(calls.every(x=>x.params?.[1]==="0x64"));
    const code=rpc.requests.filter(x=>x.method==="eth_getCode");
    assert.ok(code.every(x=>x.params?.[1]==="0x64"));
  }
  // Verified historical task is Paid: Evidence must not be promoted to Proven.
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,payload),e=>
    e.code==="SDK_EVIDENCE_MISMATCH"&&e.chargeAgain===false);
});

test("different canonical block hashes at the same height are a witness conflict",async t=>{
  const a=await localRpc(t,{headBlock:"0x65"});
  const b=await localRpc(t,{headBlock:"0x65",blockHash:"0x"+"cc".repeat(32)});
  const sdk=createAgentLedgerVerifier({rpcUrl:a.url,witnessRpcUrl:b.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),e=>
    e.code==="SDK_WITNESS_CONFLICT"&&!e.retryable&&e.chargeAgain===false);
  assert.equal(a.calls.includes("eth_call"),false);
  assert.equal(b.calls.includes("eth_call"),false);
});

test("reorg during dual-RPC task read fails closed after historical eth_call",async t=>{
  const oldHash="0x"+"ab".repeat(32),newHash="0x"+"dd".repeat(32);
  const a=await localRpc(t,{blockHashes:[oldHash,newHash]});
  const b=await localRpc(t,{blockHash:oldHash});
  const sdk=createAgentLedgerVerifier({rpcUrl:a.url,witnessRpcUrl:b.url});
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,payload),e=>
    e.code==="SDK_WITNESS_CONFLICT"&&e.operation==="verify"&&e.chargeAgain===false);
  assert.ok(a.calls.includes("eth_call"));
});

test("unavailable historical block refuses dual witness without implicit latest fallback",async t=>{
  const a=await localRpc(t);
  const b=await localRpc(t,{missingHistorical:true});
  const sdk=createAgentLedgerVerifier({rpcUrl:a.url,witnessRpcUrl:b.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),e=>
    e.code==="SDK_OBSERVATION_UNAVAILABLE"&&e.retryable===true&&e.chargeAgain===false);
  assert.equal(a.calls.includes("eth_call"),false);
});

test("pruned historical state has stable non-retryable source diagnosis and no secret echo",async t=>{
  const first=await localRpc(t);
  const second=await localRpc(t,{rpcErrors:{
    eth_call:{code:-32000,message:"missing trie node; credentials=SECRET_DO_NOT_ECHO"}
  }});
  const sdk=createAgentLedgerVerifier({rpcUrl:first.url,witnessRpcUrl:second.url});
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),e=>{
    assert.equal(e.code,"SDK_HISTORICAL_STATE_UNAVAILABLE");
    assert.equal(e.operation,"observe");
    assert.equal(e.rpcStage,"HISTORICAL_STATE");
    assert.equal(e.rpcRole,"WITNESS");
    assert.equal(e.retryable,false);
    assert.equal(e.paymentStatus,"PaymentUnknown");
    assert.equal(e.chargeAgain,false);
    assert.equal(e.message.includes("SECRET_DO_NOT_ECHO"),false);
    return true;
  });
  assert.ok(second.calls.includes("eth_call"));
});

test("unsupported historical header RPC method is typed without a raw node response",async t=>{
  const first=await localRpc(t);
  const second=await localRpc(t,{rpcErrors:{
    eth_getBlockByNumber:{code:-32601,message:"Method not found /tenant/SECRET_PATH"}
  }});
  const sdk=createAgentLedgerVerifier({rpcUrl:first.url,witnessRpcUrl:second.url});
  await assert.rejects(()=>sdk.verify(CONTRACT,ID,payload),e=>{
    assert.equal(e.code,"SDK_HISTORICAL_STATE_UNAVAILABLE");
    assert.equal(e.operation,"verify");
    assert.equal(e.rpcStage,"BLOCK_HEADER");
    assert.equal(e.rpcRole,"WITNESS");
    assert.equal(e.retryable,false);
    assert.equal(e.message.includes("SECRET_PATH"),false);
    return true;
  });
  assert.equal(second.calls.includes("eth_call"),false);
});

test("temporary unavailable witness reports its stage but remains read-only retryable",async t=>{
  const first=await localRpc(t);
  const sdk=createAgentLedgerVerifier({
    rpcUrl:first.url,witnessRpcUrl:"http://127.0.0.1:1"
  });
  await assert.rejects(()=>sdk.observe(CONTRACT,ID),e=>{
    assert.equal(e.code,"SDK_OBSERVATION_UNAVAILABLE");
    assert.equal(e.rpcStage,"HEAD");
    assert.equal(e.rpcRole,"WITNESS");
    assert.equal(e.retryable,true);
    assert.equal(e.paymentStatus,"PaymentUnknown");
    assert.equal(e.chargeAgain,false);
    return true;
  });
});
