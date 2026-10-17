#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Generate an isolated TESTNET-ONLY key on the operator's own machine.
// Never prints, uploads, or commits the secret.
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export function createDevWallet({home=homedir(), gen=generatePrivateKey} = {}) {
  const root=join(home,".config","agentledger","dev-wallets");
  mkdirSync(root,{recursive:true,mode:0o700});
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
