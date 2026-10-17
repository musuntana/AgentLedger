// SPDX-License-Identifier: Apache-2.0
// Authored during integration; execution deferred at the user's request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonJournal, RUN_KEY } from '../tools/mon/journal.mjs';
import { decodeTask, paymentRecorderData, getTaskData } from '../tools/mon/abi.mjs';
import { runMonPayment } from '../tools/mon/pipeline.mjs';
import { buildMonPaymentEvidence } from '../tools/mon/mon-evidence.mjs';

const from = '0x' + '11'.repeat(20), to = '0x' + '22'.repeat(20);
const contract = '0x' + '33'.repeat(20), taskId = '0x' + '44'.repeat(32);
const hash = '0x' + '55'.repeat(32), blockHash = '0x' + '66'.repeat(32);
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const key = stage => RUN_KEY + '.' + taskId + '.' + stage;
const record = { chainId: 10143, from, to, value: '0x1', data: '0x', nonce: '0x0', status: 'SIGNATURE_REQUESTED' };

test('current-contract absent task is decoded as None', () => {
  assert.equal(decodeTask('0x' + '0'.repeat(11 * 64)).status, 'None');
  assert.throws(() => decodeTask('0x' + '0'.repeat(12 * 64)), /length/);
});

test('lost transfer acknowledgement stops without a second signature', async () => {
  const saved = storage(); saved.setItem(key('transfer'), JSON.stringify(record));
  const journal = createMonJournal(saved, { taskId }, () => { throw Error('Unexpected RPC'); }, async () => {});
  await assert.rejects(journal.submit('transfer', { from, to, value: '0x1' }), /响应未知/);
  assert.equal(JSON.parse(saved.getItem(key('transfer'))).transactionHash, undefined);
});

test('submitted transfer is checked and reused without estimating or resending', async () => {
  const saved = storage(); saved.setItem(key('transfer'), JSON.stringify({ ...record, transactionHash: hash }));
  const calls = [];
  const request = async method => {
    calls.push(method);
    if (method === 'eth_chainId') return '0x279f';
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: hash, blockNumber: '0x1', blockHash };
    if (method === 'eth_getTransactionByHash') return { from, to, input: '0x', value: '0x1', nonce: '0x0' };
    if (method === 'eth_getBlockByNumber') return { hash: blockHash };
    throw Error('Unexpected RPC ' + method);
  };
  const journal = createMonJournal(saved, { taskId }, request, async () => {});
  assert.equal(await journal.submit('transfer', { from, to, value: '0x1' }), hash);
  assert.equal(calls.includes('eth_sendTransaction'), false);
  assert.equal(calls.includes('eth_estimateGas'), false);
  await assert.rejects(journal.submit('transfer', { from, to, value: '0x2' }), /禁止覆盖/);
});

test('session change before submission cannot open a signature request', async () => {
  const saved = storage(); let checks = 0; const calls = [];
  const journal = createMonJournal(saved, { taskId }, async method => {
    calls.push(method);
    if (method === 'eth_estimateGas') return '0x5208';
    if (method === 'eth_gasPrice') return '0x1';
    throw Error('Unexpected RPC ' + method);
  }, async () => { if (++checks === 2) throw Error('session changed'); });
  await assert.rejects(journal.submit('transfer', { from, to, value: '0x1' }), /session changed/);
  assert.equal(calls.includes('eth_sendTransaction'), false);
  assert.equal(saved.getItem(key('transfer')), null);
});

function pipelineTransport(recorder = from) {
  return { request: async (method, params) => {
    if (method === 'eth_chainId') return '0x279f';
    if (method === 'eth_getCode') return params[0] === to ? '0x' : '0x6000';
    if (method === 'eth_getBalance') return '0x3635c9adc5dea00000';
    if (method === 'eth_gasPrice') return '0x1';
    if (method === 'eth_call' && params[0].data === paymentRecorderData()) return '0x' + recorder.slice(2).padStart(64, '0');
    if (method === 'eth_call' && params[0].data === getTaskData(taskId)) return '0x' + '0'.repeat(11 * 64);
    throw Error('Unexpected RPC ' + method);
  } };
}
const options = { contract, taskId, description: 'sample', from, to, valueAtomic: '1', maxBudgetAtomic: '1' };

test('None task reaches creation adapter rather than being treated as an RPC failure', async () => {
  let stage;
  await assert.rejects(runMonPayment({ ...options, transport: pipelineTransport(),
    submitTransaction: async name => { stage = name; throw Error('stop-before-signing'); },
  }), /stop-before-signing/);
  assert.equal(stage, 'createTask');
});

test('recorder mismatch aborts before any transaction adapter is called', async () => {
  let writes = 0;
  await assert.rejects(runMonPayment({ ...options, transport: pipelineTransport(to),
    submitTransaction: async () => { writes++; },
  }), /paymentRecorder/);
  assert.equal(writes, 0);
});

test('MON evidence refuses receipt and canonical-block mismatch', async () => {
  await assert.rejects(buildMonPaymentEvidence({ taskId, transactionHash: hash,
    receipt: { transactionHash: hash, blockNumber: '0x1', blockHash },
    tx: { hash, blockNumber: '0x1', blockHash },
    block: { number: '0x1', hash: '0x' + '77'.repeat(32) },
  }), /identity mismatch/);
});
