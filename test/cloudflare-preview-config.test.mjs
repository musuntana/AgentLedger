// SPDX-License-Identifier: Apache-2.0
// Worker Previews do not inherit production vars. Fail CI rather than shipping
// a Preview whose read-only /api/task path has no configured testnet RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('Cloudflare Worker Preview has an explicit public Monad testnet RPC', () => {
  assert.equal(config.vars?.MONAD_RPC_URL, 'https://testnet-rpc.monad.xyz');
  assert.ok(config.previews && typeof config.previews === 'object');
  assert.equal(config.previews.vars?.MONAD_RPC_URL, 'https://testnet-rpc.monad.xyz');
  // Cloudflare Preview static assets are configured at top level, not repeated
  // as a Preview-specific resource. Read-only API and pages share one origin.
  assert.equal(config.assets?.binding, 'ASSETS');
  assert.equal(config.assets?.run_worker_first, true);
  assert.equal(Object.hasOwn(config.previews, 'assets'), false);
});
