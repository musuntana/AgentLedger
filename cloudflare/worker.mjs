// SPDX-License-Identifier: Apache-2.0
// Fetch-native adapter. The Worker has read-only chain access and serves browser
// assets. Wallet signatures and transaction journals remain in the user's browser.
import siteManifest from '../out/cloudflare/site-manifest.json';
import { makeClient, readTask } from '../examples/verifier/lib/task-reader.mjs';
import { observeTaskCreation } from '../examples/verifier/lib/task-creation.mjs';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self';",
};
const ROUTES = new Map([
  ['/', '/workbench.html'], ['/studio', '/studio.html'], ['/demo', '/studio.html'],
  ['/mon', '/mon/index.html'], ['/mon/', '/mon/index.html'],
  ['/artifact.json', '/artifact.json'], ['/api/showcase', '/showcase.json'],
  ...['app.mjs', 'demo-scenarios.mjs', 'demo-guide.mjs', 'text-stats.mjs',
    'summary.mjs', 'verdict-matrix.mjs', 'evidence-browser.mjs', 'locale.mjs', 'locale-copy.mjs',
    'style.css', 'experience.css', 'deploy.mjs', 'wallet-connection.mjs',
    'testnet-transactions.mjs', 'deploy.css'].map(name => ['/' + name, '/' + name]),
  ...['app', 'abi', 'sha256', 'mon-evidence', 'pipeline', 'journal']
    .map(name => ['/mon/' + name + '.mjs', '/mon/' + name + '.mjs']),
]);
// Longest base wins so /pitch/en/ remains distinct from the Chinese pitch.
const SITES = Object.entries(siteManifest).sort(([a], [b]) => b.length - a.length)
  .map(([base, data]) => ({ base, ...data, allowed: new Set(data.files) }));
function siteCsp(site) {
  // Production exports can contain small inline bootstraps. Authorize exact
  // build-time hashes; only styles need inline rules for React Native Web/Vue.
  return "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "script-src 'self' " + site.scriptHashes.join(' ') + "; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
    "connect-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none';";
}
async function serveAsset(request, env, asset, csp = HEADERS['content-security-policy']) {
  const assetUrl = new URL(request.url); assetUrl.pathname = asset; assetUrl.search = '';
  try {
    const response = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(HEADERS)) headers.set(name, value);
    headers.set('content-security-policy', csp);
    return new Response(request.method === 'HEAD' ? null : response.body,
      { status: response.status, headers });
  } catch { return json({ error: 'Assets unavailable' }, 503); }
}
const CREATION_ERRORS = new Set(['WRONG_CHAIN', 'CREATION_REVERTED', 'RECEIPT_MISMATCH',
  'TRANSACTION_MISMATCH', 'NOT_TASK_CREATION', 'TASK_ID_MISMATCH',
  'CREATION_EVENT_MISMATCH', 'TASK_READBACK_MISMATCH', 'CREATION_BLOCK_CHANGED']);
function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status,
    headers: { ...HEADERS, 'content-type': 'application/json; charset=utf-8', ...extra } });
}
function lookupParams(url, creation = false) {
  const keys = creation ? ['contract', 'taskId', 'transactionHash'] : ['contract', 'taskId'];
  const params = url.searchParams;
  // Exact count also rejects duplicate query fields.
  if (params.size !== keys.length || keys.some(key => !params.has(key)) ||
      !ADDRESS.test(params.get('contract') || '') || !HASH.test(params.get('taskId') || '') ||
      (creation && !HASH.test(params.get('transactionHash') || ''))) return null;
  return keys.map(key => params.get(key));
}
export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Read-only service' }, 405, { allow: 'GET, HEAD' });
    const url = new URL(request.url);
    if (url.pathname === '/api/healthz') return json({ ok: true, chainId: 10143, mode: 'read-only' });
    if (url.pathname === '/api/task' || url.pathname === '/api/task-creation') {
      if (request.method === 'HEAD') return new Response(null, { status: 405, headers: { ...HEADERS, allow: 'GET' } });
      const creation = url.pathname === '/api/task-creation';
      const params = lookupParams(url, creation);
      if (!params) return json({ error: 'Valid contract, taskId and creation transactionHash (if applicable) required' }, 400);
      try {
        // The RPC is deployment configuration, never accepted from an HTTP caller.
        const client = makeClient(env.MONAD_RPC_URL);
        const result = creation ? await observeTaskCreation(client, ...params) : await readTask(client, ...params);
        return json(result, result.state === 'PENDING' ? 202 : 200);
      } catch (error) {
        // Do not expose RPC URLs, upstream messages or configuration to callers.
        if (creation) {
          const code = CREATION_ERRORS.has(error.code) ? error.code : 'RPC_UNAVAILABLE';
          return json({ error: code }, code === 'RPC_UNAVAILABLE' ? 502 : 422);
        }
        return json({ error: 'Chain lookup failed: confirm network, contract and task ID' }, 502);
      }
    }
    for (const site of SITES) {
      if (url.pathname === site.base.slice(0, -1)) {
        const target = new URL(request.url); target.pathname = site.base;
        return new Response(null, { status: 308, headers: { ...HEADERS, location: target.href } });
      }
      if (!url.pathname.startsWith(site.base)) continue;
      if (site.allowed.has(url.pathname)) return serveAsset(request, env, url.pathname, siteCsp(site));
      const suffix = url.pathname.slice(site.base.length);
      // Slidev routes include numbered slides, overview and presenter views.
      // Never serve an HTML fallback for a missing JS/CSS/font/image request.
      const navigation = request.headers.get('accept')?.includes('text/html');
      if (!suffix || (navigation && !/\.[^/]+$/.test(suffix))) {
        return serveAsset(request, env, site.base + 'index.html', siteCsp(site));
      }
      return json({ error: 'Not found' }, 404);
    }
    const asset = ROUTES.get(url.pathname);
    if (!asset) return json({ error: 'Not found' }, 404);
    return serveAsset(request, env, asset);
  },
};
