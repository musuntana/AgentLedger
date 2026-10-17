#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Read-only recovery from a durable callback hash, no wallet or journal write.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { reconcileStoredHint } from "../lib/reconcile-stored-hint.mjs";

export async function main(args) {
  if (args.length !== 3) {
    throw Error("usage: node tools/reconcile-hint.mjs APPROVAL_JSON EIP3009_NONCE EXPECTED_PAYEE");
  }
  const [file, paymentNonce, expectedPayTo] = args;
  const approval = JSON.parse(readFileSync(file, "utf8"));
  const outcome = await reconcileStoredHint({approval, paymentNonce, expectedPayTo});
  console.log(JSON.stringify(outcome, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error("UNKNOWN_NO_RECHARGE: " + error.message);
    process.exitCode = 2;
  });
}
