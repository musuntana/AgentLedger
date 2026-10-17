#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Package only public browser assets, never out/, journals, env files or receipts.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { buildCloudflareApps, publishCloudflareApps } from './build-cloudflare-apps.mjs';
import { compileLedger } from '../examples/verifier/tools/compile-ledger.mjs';

const root = new URL('../', import.meta.url);
const destination = new URL('out/cloudflare/public/', root);
// Compile before replacing the dedicated generated asset directory.
const artifact = compileLedger(root);
const sites = await buildCloudflareApps();
await rm(destination, { recursive: true, force: true });
await mkdir(new URL('mon/', destination), { recursive: true });
const copies = [
  ['examples/verifier/tools/deploy.html', 'workbench.html'],
  ['examples/verifier/public/index.html', 'studio.html'],
  ['examples/verifier/tools/mon/index.html', 'mon/index.html'],
  ['phase0/demo-showcase.json', 'showcase.json'],
  ...['app.mjs', 'demo-scenarios.mjs', 'demo-guide.mjs', 'text-stats.mjs',
    'summary.mjs', 'evidence-browser.mjs', 'locale.mjs', 'locale-copy.mjs',
    'style.css', 'experience.css'].map(name => ['examples/verifier/public/' + name, name]),
  ...['deploy.mjs', 'wallet-connection.mjs', 'testnet-transactions.mjs', 'deploy.css']
    .map(name => ['examples/verifier/tools/' + name, name]),
  ...['app', 'abi', 'sha256', 'mon-evidence', 'pipeline', 'journal']
    .map(name => ['examples/verifier/tools/mon/' + name + '.mjs', 'mon/' + name + '.mjs']),
];
await Promise.all(copies.map(([source, name]) => copyFile(new URL(source, root), new URL(name, destination))));
await writeFile(new URL('artifact.json', destination), JSON.stringify(artifact) + '\n');
await publishCloudflareApps(sites, destination);
console.log('Pocket and Chinese/English pitch assets ready at /pocket/, /pitch/ and /pitch/en/.');
console.log(`Cloudflare assets ready: ${copies.length + 1} files in out/cloudflare/public/`);
console.log(`Compiler ${artifact.compiler}; source SHA-256 ${artifact.sourceSha256}`);
