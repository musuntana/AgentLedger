// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,delimiter} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
const script=fileURLToPath(new URL("../scripts/packcheck.mjs",import.meta.url));
const entry={name:pkg.name,version:pkg.version,files:[
  "dist/index.mjs","dist/index.d.mts","README.md","package.json"
].map(path=>({path}))};

function check(t,metadata) {
  const bin=mkdtempSync(join(tmpdir(),"sdk-packcheck-"));
  t.after(()=>rmSync(bin,{recursive:true,force:true}));
  // Exercise the real checker with controlled npm output, without packing
  // or publishing anything. All existing safety checks still run.
  writeFileSync(join(bin,"npm"),`#!${process.execPath}\nprocess.stdout.write(process.env.PACK_METADATA);\n`,{mode:0o755});
  return spawnSync(process.execPath,[script],{
    encoding:"utf8",env:{...process.env,
      PATH:bin+delimiter+process.env.PATH,PACK_METADATA:JSON.stringify(metadata)}
  });
}

for(const [label,metadata] of [
  ["legacy array",[entry]],
  ["npm 12 package-name map",{[pkg.name]:entry}],
]) test(`packcheck accepts ${label}`,t=>{
  const result=check(t,metadata);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/SDK PACK CONTRACT PASS/);
});

for(const [label,metadata] of [
  ["empty array",[]], ["empty map",{}], ["null",null],
  ["multiple packages",[entry,entry]],
  ["missing file list",[{name:pkg.name,version:pkg.version}]],
]) test(`packcheck rejects ${label} with an explicit metadata error`,t=>{
  const result=check(t,metadata);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Expected exactly one SDK package with a valid file list/);
});

for(const [label,changed,message] of [
  ["wrong package name",{...entry,name:"unexpected"},/Pack metadata differs/],
  ["wrong version",{...entry,version:"0.0.0"},/Pack metadata differs/],
  ["missing declaration",{...entry,files:entry.files.filter(f=>f.path!=="dist/index.d.mts")},/SDK package missing/],
  ["private source leak",{...entry,files:[...entry.files,{path:"src/index.mjs"}]},/Private or test code leaked/],
]) test(`packcheck still rejects ${label} in package-name maps`,t=>{
  const result=check(t,{[pkg.name]:changed});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,message);
});
