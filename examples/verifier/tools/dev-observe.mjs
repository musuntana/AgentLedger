#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// An explicit development lane, not an alternate public acceptance command.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runDevObservation } from "../lib/dev-observation.mjs";

export async function main(args) {
  if(args.length!==2 || args[0]===args[1])
    throw Error("usage: dev-observe.mjs REQUEST_JSON OUTPUT_JSON");
  const request=JSON.parse(readFileSync(args[0],"utf8"));
  const result=await runDevObservation(request);
  writeFileSync(args[1],JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("DEV_TESTNET_ONLY observation written (NOT public acceptance): "+args[1]);
  console.log("Payment state: "+result.paymentState+"; chargeAgain=false");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(()=>{
    console.error("DEV_OBSERVATION_UNAVAILABLE: payment remains UNKNOWN / NO RECHARGE; no success report written.");
    process.exitCode=2;
  });
}
