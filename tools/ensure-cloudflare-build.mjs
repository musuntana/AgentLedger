#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Wrangler invokes this for deploy/preview. Some Cloudflare Git builds run
// only the deploy command, leaving the generated asset tree absent.
// Avoid a second expensive Slidev/Expo build if the separate build step ran.
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const required = [
  'out/cloudflare/public/workbench.html',
  'out/cloudflare/public/studio.html',
  'out/cloudflare/public/verdict-matrix.mjs',
  'out/cloudflare/public/pocket/index.html',
  'out/cloudflare/public/pitch/index.html',
  'out/cloudflare/public/pitch/en/index.html',
  'out/cloudflare/site-manifest.json',
];
let ready = true;
try {
  await Promise.all(required.map(async path => access(new URL(path, root))));
  const manifest = JSON.parse(await readFile(new URL('out/cloudflare/site-manifest.json', root), 'utf8'));
  for (const route of ['/pocket/', '/pitch/', '/pitch/en/']) {
    if (!Array.isArray(manifest[route]?.files) ||
        !manifest[route].files.includes(route + 'index.html')) {
      throw Error('Missing generated site route: ' + route);
    }
  }
} catch (err) {
  ready = false;
  console.log('[cloudflare] Building missing or incomplete assets: ' + err.message);
}
if (ready) {
  console.log('[cloudflare] Existing complete build detected; skipping duplicate Slidev/Expo builds.');
} else {
  const command = fileURLToPath(new URL('build-cloudflare.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [command], {
    cwd: fileURLToPath(root), stdio: 'inherit', env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw Error('Cloudflare asset build failed: ' + (result.error?.message ?? result.status));
  }
}
