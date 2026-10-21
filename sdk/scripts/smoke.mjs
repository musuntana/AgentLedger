// SPDX-License-Identifier: Apache-2.0
// Verify the actual archive from a consumer outside the workspace.
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const root=fileURLToPath(new URL("../",import.meta.url));
const pkg=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
const consumer=mkdtempSync(join(tmpdir(),"ledger-sdk-consumer-"));
function run(command,args,cwd=consumer) {
  const result=spawnSync(command,args,{cwd,stdio:"inherit",timeout:120_000,
    env:{...process.env,npm_config_update_notifier:"false"}});
  if(result.error || result.status!==0)
    throw Error(`SDK consumer check failed: ${command} ${args.join(" ")}`);
}
try {
  // The npm script builds first; ignore lifecycle scripts during this pack
  // so this check cannot recursively invoke a release hook.
  run("npm",["pack","--ignore-scripts","--pack-destination",consumer],root);
  const archive=join(consumer,pkg.name.replace(/^@/,"").replace("/","-")+"-"+pkg.version+".tgz");
  writeFileSync(join(consumer,"package.json"),JSON.stringify({private:true,type:"module"}));
  run("npm",["install","--ignore-scripts","--no-audit","--no-fund",archive]);
  // Exercise the same runtime contract against the installed public package,
  // not dist files or the monorepo's private source modules.
  for(const name of ["sdk.test.mjs","reconcile.test.mjs","consumer.ts"]){
    const source=readFileSync(join(root,"test",name),"utf8")
      .replaceAll('"../dist/index.mjs"',JSON.stringify(pkg.name));
    writeFileSync(join(consumer,name),source);
  }
  writeFileSync(join(consumer,"tsconfig.json"),readFileSync(join(root,"test/tsconfig.json")));
  run(process.execPath,["--test","sdk.test.mjs","reconcile.test.mjs"]);
  const require=createRequire(import.meta.url);
  run(process.execPath,[require.resolve("typescript/bin/tsc"),"--project","tsconfig.json"]);
  console.log("SDK INSTALLED CONSUMER PASS",JSON.stringify({name:pkg.name,version:pkg.version}));
} finally {
  rmSync(consumer,{recursive:true,force:true});
}
