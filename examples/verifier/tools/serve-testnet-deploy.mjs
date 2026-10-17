#!/usr/bin/env node
// Separate, user-signed deployment helper. The verification service stays read-only.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { compileLedger } from './compile-ledger.mjs';
import { createVerifierHandler } from '../server.mjs';

const root = new URL('../../../', import.meta.url);
const artifact = compileLedger(root);
mkdirSync(new URL('out/testnet-deploy/', root), { recursive: true });
writeFileSync(new URL('out/testnet-deploy/AgentLedger.json', root), JSON.stringify(artifact, null, 2) + '\n');
const assets = new Map([
  ['/', ['deploy.html', 'text/html; charset=utf-8']],
  ['/deploy.mjs', ['deploy.mjs', 'text/javascript; charset=utf-8']],
  ['/locale.mjs', ['../public/locale.mjs', 'text/javascript; charset=utf-8']],
  ['/locale-copy.mjs', ['../public/locale-copy.mjs', 'text/javascript; charset=utf-8']],
  ['/wallet-connection.mjs', ['wallet-connection.mjs', 'text/javascript; charset=utf-8']],
  ['/testnet-transactions.mjs', ['testnet-transactions.mjs', 'text/javascript; charset=utf-8']],
  ['/experience.css', ['../public/experience.css', 'text/css; charset=utf-8']],
  ['/deploy.css', ['deploy.css', 'text/css; charset=utf-8']],
  ['/style.css', ['../public/style.css', 'text/css; charset=utf-8']],
]);
for (const [path, file, type] of [
  ['/mon', 'mon/index.html', 'text/html; charset=utf-8'],
  ['/mon/', 'mon/index.html', 'text/html; charset=utf-8'],
  ...['app', 'abi', 'sha256', 'mon-evidence', 'pipeline', 'journal'].map(name =>
    ['/mon/' + name + '.mjs', 'mon/' + name + '.mjs', 'text/javascript; charset=utf-8']),
]) assets.set(path, [file, type]);
const verifierHandler = createVerifierHandler();
const studioPaths = new Set(['/studio', '/demo', '/app.mjs', '/demo-scenarios.mjs', '/demo-guide.mjs', '/text-stats.mjs', '/summary.mjs', '/evidence-browser.mjs', '/locale.mjs', '/locale-copy.mjs']);
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (studioPaths.has(path) || path.startsWith('/api/')) {
    if (path === '/studio') req.url = '/';
    return verifierHandler(req, res);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  if (path === '/artifact.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(artifact));
  }
  if (path === '/prepared-task.json') {
    try {
      const body = readFileSync(new URL('out/testnet-deploy/prepared-task.json', root));
      res.setHeader('Content-Type', 'application/json');
      return res.end(body);
    } catch {
      res.writeHead(404); return res.end('No prepared task');
    }
  }
  const asset = assets.get(path);
  if (!asset) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', asset[1]);
  res.end(readFileSync(new URL(asset[0], import.meta.url)));
});
const port = Number(process.env.AGENTLEDGER_DEPLOY_PORT || 4322);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('AGENTLEDGER_DEPLOY_PORT must be 1..65535');
server.listen(port, '127.0.0.1', () => {
  console.log(`Compiled ${artifact.compiler}; ${contract.evm.bytecode.object.length / 2} bytes; source SHA-256 ${artifact.sourceSha256}`);
  console.log(`MetaMask deployment: http://127.0.0.1:${port} (Monad Testnet 10143 only)`);
});
