#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Read-only recovery from a durable callback hash, no wallet or journal write.
import { readFileSync, openSync, closeSync, fstatSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { reconcileStoredHint } from "../lib/reconcile-stored-hint.mjs";

export async function main(args) {
  if (args.length !== 3) {
    throw Error("usage: node tools/reconcile-hint.mjs APPROVAL_JSON EIP3009_NONCE EXPECTED_PAYEE");
  }
  const [file, paymentNonce, expectedPayTo] = args;
  // Bound local input, and avoid disclosing operator paths and raw node
  // errors in stdout/stderr. The original signed approval stays on disk.
  const fd=openSync(file,"r");
  let source;
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile() || stat.size>2*1024*1024)throw Error("approval input unavailable");
    source=readFileSync(fd,"utf8");
  } finally {closeSync(fd);}
  const approval = JSON.parse(source);
  const outcome = await reconcileStoredHint({approval, paymentNonce, expectedPayTo});
  console.log(JSON.stringify(outcome, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    // An RPC error can contain a private provider URL; a filesystem error
    // can contain a sensitive operator path. Neither is safe to echo.
    console.error("UNKNOWN_NO_RECHARGE: original payment could not be independently verified; inspect local inputs and RPC configuration");
    process.exitCode = 2;
  });
}
