// SPDX-License-Identifier: Apache-2.0
// Regression: the repository's default branch is master, not main.
// A green PR must not be the last time the complete gate ever executes.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");

test("full GitHub Actions suite runs on default master pushes",()=>{
  assert.match(workflow,/^  push:\n    branches: \[[^\n\]]*\bmaster\b[^\n\]]*\]/m);
  assert.match(workflow,/^  pull_request:/m);
  for(const job of ["node-sdk-python-studio","forge-anvil","cloudflare-worker","pocket","judge-pitch"]){
    assert.ok(workflow.includes("  "+job+":"),"missing mainline gate: "+job);
  }
  assert.match(workflow,/SDK consumer types and npm pack safety/);
});
