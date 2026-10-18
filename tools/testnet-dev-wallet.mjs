#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Generate an isolated TESTNET-ONLY key on the operator's own machine.
// Never prints, uploads, or commits the secret.
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export function createDevWallet({home=homedir(), gen=generatePrivateKey} = {}) {
  const config=join(home,".config");
  const agent=join(config,"agentledger");
  const root=join(agent,"dev-wallets");
  // Refuse symlinked or foreign-owned wallet storage components. Do not
  // chmod or write through an attacker-provided redirected path.
  for(const dir of [config,agent,root]) {
    try { mkdirSync(dir,{mode:0o700}); }
    catch(error) { if(error.code!=="EEXIST")throw error; }
    const st=lstatSync(dir);
    if(!st.isDirectory() || st.isSymbolicLink() ||
       (typeof process.getuid==="function" && st.uid!==process.getuid())) {
      throw Error("Unsafe developer wallet storage path");
    }
  }
  chmodSync(root,0o700);
  const folder=mkdtempSync(join(root,"throwaway-"));
  chmodSync(folder,0o700);
  const privateKey=gen();
  const address=privateKeyToAccount(privateKey).address;
  const file=join(folder,"wallet.json");
  writeFileSync(file,JSON.stringify({
    schemaVersion:"agentledger.dev-wallet.v1",purpose:"THROWAWAY_MONAD_TESTNET_ONLY",
    chainId:10143,address,privateKey
  },null,2)+"\n",{flag:"wx",mode:0o600});
  return {address,file,network:"Monad Testnet (chain 10143)"};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const wallet=createDevWallet();
    console.log("TESTNET-ONLY wallet address: "+wallet.address);
    console.log("Private key stored locally (NOT PRINTED): "+wallet.file);
    console.log("Fund the address from a Monad Testnet faucet. Never reuse this key on mainnet.");
  } catch {
    console.error("Unable to create local isolated testnet wallet. No secret was printed.");
    process.exitCode=1;
  }
}
