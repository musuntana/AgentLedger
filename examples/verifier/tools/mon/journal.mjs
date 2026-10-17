// SPDX-License-Identifier: Apache-2.0
import { createTransactionJournal, verifyTransaction } from '../testnet-transactions.mjs';

export const RUN_KEY = 'agentledger.mon-payment.run.v1';
export const STAGES = ['createTask', 'transfer', 'recordPayment', 'submitEvidence'];
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function createMonJournal(storage, run, request, assertSession) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(run.taskId)) throw Error('Invalid run task ID');
  const key = stage => RUN_KEY + '.' + run.taskId.toLowerCase() + '.' + stage;
  const journal = stage => {
    if (!STAGES.includes(stage)) throw Error('Unknown MON stage');
    return createTransactionJournal(storage, key(stage));
  };
  const load = stage => journal(stage).load();
  async function submit(stage, call) {
    await assertSession();
    const current = journal(stage);
    const record = current.load();
    if (record) {
      if (!same(record.from, call.from) || !same(record.to, call.to) ||
          !same(record.data, call.data ?? '0x') || BigInt(record.value) !== BigInt(call.value ?? 0)) {
        throw Error('原交易参数与当前流程不同；禁止覆盖或重发。');
      }
      if (!record.transactionHash) throw Error(`${stage} 的钱包响应未知。请填入钱包活动中的原交易哈希后恢复；不会重发。`);
      if (!await verifyTransaction(request, record)) throw Error(`${stage} 原交易仍待确认，请稍后继续；不会重发。`);
      return record.transactionHash;
    }
    const [gas, gasPrice] = await Promise.all([
      request('eth_estimateGas', [call]), request('eth_gasPrice'),
    ]);
    await assertSession();
    // Recheck identity immediately before eth_sendTransaction as well as nonce lookup.
    const guardedRequest = async (method, params) => {
      if (method === 'eth_sendTransaction') await assertSession();
      return request(method, params);
    };
    const result = await current.submit(guardedRequest,
      { ...call, data: call.data ?? '0x', gas, gasPrice }, { stage, taskId: run.taskId });
    return result.transactionHash;
  }
  async function recover(stage, hash) {
    const current = journal(stage), record = current.load();
    if (!record || record.transactionHash) throw Error('此步骤没有待恢复的签名请求。');
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw Error('请输入完整的原交易哈希。');
    await assertSession();
    const receipt = await verifyTransaction(request, record, hash);
    if (!receipt) throw Error('原交易尚未确认，请稍后检查；不会重发。');
    current.save({ ...record, transactionHash: hash, status: 'SUBMITTED' });
  }
  async function verify(stage, hash) {
    const record = load(stage);
    if (!record || !same(record.transactionHash, hash)) throw Error('Missing original transaction journal');
    if (!await verifyTransaction(request, record, hash)) throw Error('Original transaction receipt is pending');
  }
  return { load, submit, recover, verify };
}
