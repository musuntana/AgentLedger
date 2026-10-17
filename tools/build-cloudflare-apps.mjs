// SPDX-License-Identifier: Apache-2.0
// Build production sites, never launch development servers in the Worker.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const staging = new URL('out/cloudflare/sites/', root);
function run(command, args, cwd, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: fileURLToPath(cwd), stdio: 'inherit',
      env: { ...process.env, CI: '1', ...extra } });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() :
      reject(Error(`${command} failed (${signal || code})`)));
  });
}
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) result.push(...await files(target));
    else if (entry.isFile()) result.push(target);
    else throw Error('Unexpected non-regular site asset: ' + entry.name);
  }
  return result;
}
const rewrites = [
  ['http://127.0.0.1:8081', '/pocket/'],
  ['http://127.0.0.1:4322/demo', '/demo'],
  ['../dist-judge-en/', '/pitch/en/'],
  ['../dist-judge/', '/pitch/'],
];
async function prepareSite(directory, { pitch = false } = {}) {
  let html = '';
  const names = [];
  for (const file of await files(directory)) {
    const relative = fileURLToPath(file).slice(fileURLToPath(directory).length);
    names.push(relative);
    if (pitch && /\.(html|js|css)$/.test(relative)) {
      let source = await readFile(file, 'utf8');
      for (const [from, to] of rewrites) source = source.split(from).join(to);
      await writeFile(file, source);
    }
    if (/\.html$/.test(relative)) html += await readFile(file, 'utf8');
  }
  const scriptHashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) {
      scriptHashes.push("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
    }
  }
  return { files: names.sort(), scriptHashes: [...new Set(scriptHashes)] };
}
export async function buildCloudflareApps() {
  await mkdir(staging, { recursive: true });
  // Separate package locks are intentional: these are not root npm workspaces.
  await Promise.all(['slides/', 'apps/pocket/'].map(path =>
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], new URL(path, root))));
  const slides = new URL('slides/', root);
  const cli = fileURLToPath(new URL('node_modules/@slidev/cli/bin/slidev.mjs', slides));
  for (const [entry, output, base] of [
    ['judge.md', 'pitch-zh/', '/pitch/'], ['judge.en.md', 'pitch-en/', '/pitch/en/'],
  ]) {
    await run(process.execPath, [cli, 'build', entry, '--base', base, '--out',
      fileURLToPath(new URL(output, staging)), '--without-notes'], slides);
  }
  await run(process.execPath, [fileURLToPath(new URL('apps/pocket/node_modules/expo/bin/cli', root)),
    'export', '--platform', 'web', '--output-dir', fileURLToPath(new URL('pocket/', staging)),
    '--max-workers', '2'], new URL('apps/pocket/', root), {
    AGENTLEDGER_WEB_BASE_PATH: '/pocket', EXPO_PUBLIC_VERIFIER_URL: 'same-origin',
  });
  return {
    '/pitch/': { directory: new URL('pitch-zh/', staging), ...await prepareSite(new URL('pitch-zh/', staging), { pitch: true }) },
    '/pitch/en/': { directory: new URL('pitch-en/', staging), ...await prepareSite(new URL('pitch-en/', staging), { pitch: true }) },
    '/pocket/': { directory: new URL('pocket/', staging), ...await prepareSite(new URL('pocket/', staging)) },
  };
}
export async function publishCloudflareApps(sites, destination) {
  const manifest = {};
  for (const [base, { directory, files, scriptHashes }] of Object.entries(sites)) {
    const target = new URL(base.slice(1), destination);
    await mkdir(target, { recursive: true });
    await cp(directory, target, { recursive: true });
    manifest[base] = { files: files.map(name => base + name), scriptHashes };
  }
  await writeFile(new URL('out/cloudflare/site-manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
}
