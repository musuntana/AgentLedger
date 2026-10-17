// SPDX-License-Identifier: Apache-2.0
// Local integration adapter; no private keys or automatic wallet authorization.
import { initLanguage, localize } from '/locale.mjs';
import { createWalletConnection } from '../wallet-connection.mjs';
import { createMonJournal, RUN_KEY, STAGES } from './journal.mjs';
import { runMonPayment, STEP_LABELS } from './pipeline.mjs';
import { parseMon } from './mon-evidence.mjs';
import { decodeAddress, paymentRecorderData } from './abi.mjs';

const $ = id => document.getElementById(id);
initLanguage({ fallback: 'zh' });
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const serialize = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const fields = ['contract', 'payee', 'amount', 'description'];
const STEP_DISPLAY = { ...STEP_LABELS, recordPayment: '记录付款声明',
  evidence: '生成付款证据', verify: '核对转账、证据与任务' };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
let account = null, busy = false, session = 0, active = null, artifact = null, blocked = false;
const stepStates = new Map();
const status = (message, tone = 'info') => {
  $('status').textContent = message;
  $('status').closest('.status-box').dataset.tone = tone;
};
function draftIssue() {
  if (blocked) return '本地记录不可读，请先核对钱包活动。';
  if (!account) return '请先连接钱包。';
  if (active && !same(active.from, account)) return '请切换到原实验的付款账户。';
  if (active?.state === 'COMPLETE') return '上次流程已完成。可下载记录，或保留原记录后新建实验。';
  const contract = active?.contract || $('contract').value.trim();
  const to = active?.to || $('payee').value.trim();
  if (!ADDRESS.test(contract)) return '请填写有效的账本合约地址。';
  if (!ADDRESS.test(to) || /^0x0{40}$/i.test(to) || same(to, account)) return '请填写不同于账户 A 的有效收款地址。';
  try {
    const amount = active ? BigInt(active.valueAtomic) : parseMon($('amount').value.trim());
    if (amount <= 0n || amount >= 2n ** 256n) return '请填写大于 0 的有效 MON 金额。';
  } catch { return 'MON 金额最多支持 18 位小数。'; }
  const description = active?.description ?? $('description').value;
  if (!description.trim() || new TextEncoder().encode(description).length > 100000) return '请填写 1–100000 字节的任务说明。';
  if (!$('consent').checked) return '请先核对转账摘要，再勾选确认选项。';
  return '';
}
function renderPreview() {
  $('preview-from').textContent = active?.from || account || '—';
  $('preview-to').textContent = active?.to || $('payee').value.trim() || '—';
  $('preview-amount').textContent = active?.amountText || $('amount').value.trim() || '—';
  $('run-source').textContent = active?.state === 'COMPLETE' ? '上次记录' : active ? '原流程' : '待确认';
  const evidence = active?.result || active?.evidence;
  $('evidence-digest').textContent = evidence?.evidenceHash || evidence?.hash || '—';
  $('transfer-digest').textContent = evidence?.transferHash || '—';
  $('evidence-source').textContent = evidence ? '已保存在此浏览器' : '尚未生成';
  $('evidence-empty').hidden = Boolean(evidence);
}
function seedSteps() {
  $('steps').textContent = ''; stepStates.clear();
  for (const id of Object.keys(STEP_LABELS)) updateStep({ id, status: 'pending' });
}

function changed() {
  session++; account = null;
  $('account').textContent = '钱包状态变化，请重新连接；原交易和证据已保留。';
  status('流程暂停。重新连接原账户与测试网后可继续，不会重付。');
  render();
}
const wallet = createWalletConnection(window, changed, {
  onRequest: ({ method, status: state }) => {
    if (state === 'waiting') status(`${method} 正在等待 MetaMask。请处理原请求，不要重复点击。`);
  },
});
const request = wallet.request;
function render() {
  for (const id of fields) $(id).disabled = busy || Boolean(active) || blocked;
  for (const id of ['connect', 'select-account', 'network']) $(id).disabled = busy || blocked;
  const issue = draftIssue();
  $('run').disabled = busy || Boolean(issue);
  $('run').textContent = busy ? '正在处理原流程…' : active?.state === 'COMPLETE' ? '上次流程已完成' : active ? '继续原流程' : '开始实验';
  $('action-hint').textContent = busy ? '请处理 MetaMask 中的原请求，不要重复点击。' : issue || '准备就绪。开始后会逐笔请求钱包确认。';
  $('consent').disabled = busy || blocked || active?.state === 'COMPLETE';
  $('download').disabled = !active;
  $('new-run').textContent = active?.state === 'COMPLETE' ? '新建实验 · 保留记录' : '修改未提交参数 · 保留记录';
  $('steps').setAttribute('aria-busy', String(busy));
  renderPreview();
  $('recover').disabled = busy || blocked || !account || !active;
  $('new-run').disabled = busy || blocked || !active;
  $('task-id').value = active?.taskId || '';
}
function persist() {
  // Preserve each run as well as the current-run pointer. Never overwrite journals.
  localStorage.setItem(RUN_KEY + '.archive.' + active.taskId, serialize(active));
  localStorage.setItem(RUN_KEY, serialize(active));
}
function restore() {
  const raw = localStorage.getItem(RUN_KEY);
  if (!raw) return;
  active = JSON.parse(raw);
  if (active?.schemaVersion !== 'agentledger.mon-run.v1' || !HASH.test(active.taskId) ||
      !ADDRESS.test(active.from) || !ADDRESS.test(active.contract) || !ADDRESS.test(active.to) ||
      typeof active.description !== 'string' || BigInt(active.valueAtomic) <= 0n) throw Error('实验记录格式损坏，禁止自动创建新流程。');
  for (const id of fields) $(id).value = ({ contract: active.contract, payee: active.to,
    amount: active.amountText, description: active.description })[id];
  $('result').textContent = serialize(active.result || active.evidence || {});
  for (const record of active.result?.steps || []) updateStep(record);
  status('已恢复原实验。请连接原账户；继续流程只核对并复用原交易。');
}
async function exclusive(fn) {
  if (busy || blocked) return;
  if (!navigator.locks) { status('当前浏览器不支持跨标签页锁，请使用新版 Chrome；未发送交易。'); return; }
  busy = true; render();
  try {
    await navigator.locks.request('agentledger.mon-payment.writer', { ifAvailable: true }, async lock => {
      if (!lock) throw Error('另一标签页正在处理 MON 实验，请在原页面完成。');
      const current = localStorage.getItem(RUN_KEY);
      if (current !== (active ? serialize(active) : null)) throw Error('另一页面更新了实验记录，请刷新后恢复原流程。');
      await fn();
    });
  } catch (error) { status(error.message + ' 不会自动重发。', 'error'); }
  finally { busy = false; render(); }
}
async function connect(select = false) {
  await exclusive(async () => {
    if (select) await wallet.selectAccount();
    const accounts = await request('eth_requestAccounts');
    const version = session;
    const chain = await request('eth_chainId');
    if (version !== session) throw Error('连接期间钱包状态已变化，请重新连接。');
    if (!ADDRESS.test(accounts?.[0] || '')) throw Error('钱包未返回账户。');
    if (chain !== '0x279f') throw Error('请点击切换测试网，再连接账户。');
    account = accounts[0];
    $('account').textContent = '账户 A：' + account + ' · Monad Testnet（10143）';
    status(active && !same(active.from, account) ? '此实验绑定另一账户，请切换到 ' + active.from : '已连接。请核对收款地址、金额和交易确认选项。');
  });
}
async function checkContract(contract, from) {
  if (!artifact) {
    const response = await fetch('/artifact.json', { cache: 'no-store' });
    if (!response.ok) throw Error('当前合约编译产物不可用。');
    artifact = await response.json();
  }
  const recorder = decodeAddress(await request('eth_call', [{ to: contract, data: paymentRecorderData() }, 'latest']));
  if (!same(recorder, from)) throw Error('当前账户不是该合约的 paymentRecorder。请在工作台部署 recorder 为当前账户的合约。');
  let expected = artifact.deployedBytecode.slice(2);
  for (const ref of Object.values(artifact.immutableReferences).flat()) {
    const word = recorder.slice(2).padStart(ref.length * 2, '0');
    expected = expected.slice(0, ref.start * 2) + word + expected.slice((ref.start + ref.length) * 2);
  }
  const actual = await request('eth_getCode', [contract, 'latest']);
  if (!same(actual, '0x' + expected)) throw Error('合约运行时代码与当前编译产物不一致，尚未发送交易。');
}
function updateStep(record) {
  const ids = Object.keys(STEP_LABELS);
  if (!ids.includes(record.id)) return;
  let item = $('steps').querySelector(`[data-step="${record.id}"]`);
  if (!item) {
    item = document.createElement('li'); item.dataset.step = record.id;
    const marker = document.createElement('span'); marker.className = 'step-marker'; marker.setAttribute('aria-hidden', 'true');
    const head = document.createElement('div'); head.className = 'step-heading';
    const title = document.createElement('span'); title.textContent = STEP_DISPLAY[record.id];
    const state = document.createElement('span'); state.className = 'step-state';
    const detail = document.createElement('p'); detail.className = 'step-detail'; detail.dataset.i18nRaw = '';
    head.append(title, state); item.append(marker, head, detail); $('steps').append(item);
  }
  const labels = { pending: '等待', running: '处理中', ok: '已核对', fail: '已中断', warn: '需处理' };
  item.dataset.state = record.status;
  item.querySelector('.step-marker').textContent = record.status === 'ok' ? '✓' : record.status === 'fail' ? '!' : String(ids.indexOf(record.id) + 1);
  item.querySelector('.step-state').textContent = labels[record.status] || labels.pending;
  item.querySelector('.step-detail').textContent = record.detail || '';
  item.querySelector('.step-detail').hidden = !record.detail;
  if (record.status === 'running') item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  stepStates.set(record.id, record.status);
  const completed = [...stepStates.values()].filter(state => state === 'ok').length;
  $('progress-count').textContent = completed ? `${completed} / ${ids.length}` : '尚未开始';
}
async function start() {
  await exclusive(async () => {
    if (!$('consent').checked) throw Error('请先核对并勾选交易确认选项。');
    const version = session, selected = account;
    const assertSession = async () => {
      if (version !== session || !selected || !same(account, selected)) throw Error('钱包会话已变化，已暂停下一笔交易。');
      const chain = await request('eth_chainId'), accounts = await request('eth_accounts');
      if (version !== session || chain !== '0x279f' || !same(accounts?.[0], selected)) throw Error('钱包账户或网络不匹配，已暂停。');
    };
    await assertSession();
    const contract = active?.contract || $('contract').value.trim();
    await checkContract(contract, selected);
    await assertSession();
    if (!active) {
      const to = $('payee').value.trim(), amountText = $('amount').value.trim();
      const description = $('description').value;
      const amount = parseMon(amountText);
      if (!ADDRESS.test(contract) || !ADDRESS.test(to) || /^0x0{40}$/i.test(to) || same(to, selected)) throw Error('请填写有效且不同的账户 A、B 地址，不能使用零地址。');
      if (amount <= 0n || amount >= 2n ** 256n || !description.trim() || new TextEncoder().encode(description).length > 100000) throw Error('请输入有效金额与 1–100000 字节的任务说明。');
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      active = { schemaVersion: 'agentledger.mon-run.v1', state: 'STARTED',
        taskId: '0x' + Array.from(bytes, n => n.toString(16).padStart(2, '0')).join(''),
        from: selected, to, contract, description, amountText, valueAtomic: amount.toString() };
      persist(); render();
    }
    if (!same(active.from, selected)) throw Error('请连接此实验绑定的原账户：' + active.from);
    const journal = createMonJournal(localStorage, active, request, assertSession);
    status('正在处理原流程。请逐笔核对 MetaMask；中断后可继续。');
    const result = await runMonPayment({ transport: { request }, contract: active.contract,
      taskId: active.taskId, description: active.description, from: active.from, to: active.to,
      valueAtomic: active.valueAtomic, maxBudgetAtomic: active.valueAtomic,
      hasCreateIntent: Boolean(journal.load('createTask')),
      hasTransferIntent: Boolean(journal.load('transfer')), submitTransaction: journal.submit, verifyTransaction: journal.verify,
    }, {
      onStep: updateStep,
      onEvidence: async evidence => { active.evidence = evidence; persist(); $('result').textContent = serialize(evidence); renderPreview(); },
    });
    active.result = result; active.state = 'COMPLETE'; persist();
    $('result').textContent = serialize(result);
    status('MON 转账、recorder 声明和证据锚定已读回核对。结果来自当前钱包 RPC；不是独立 USDC 支付验收或终局性保证。', 'success');
  });
}
async function recover() {
  await exclusive(async () => {
    if (!active || !same(active.from, account)) throw Error('请连接原实验账户。');
    const version = session;
    const journal = createMonJournal(localStorage, active, request, async () => {
      if (session !== version || !same((await request('eth_accounts'))?.[0], active.from) || await request('eth_chainId') !== '0x279f') throw Error('账户或网络已变化。');
    });
    await journal.recover($('recovery-stage').value, $('recovery-hash').value.trim());
    status('原交易已核对并恢复。点击继续原流程，不会重复发送该笔交易。');
  });
}
function download() {
  try {
    if (!active) throw Error('尚无实验记录。');
    const journals = Object.fromEntries(STAGES.map(stage => [stage, JSON.parse(localStorage.getItem(RUN_KEY + '.' + active.taskId.toLowerCase() + '.' + stage) || 'null')]));
    const bundle = { schemaVersion: 'agentledger.mon-payment-bundle.v1', asset: 'MON', network: 'eip155:10143',
      observationSource: 'WALLET_RPC_NOT_INDEPENDENT_ACCEPTANCE', complete: active.state === 'COMPLETE', chargeAgain: false, run: active, journals };
    const url = URL.createObjectURL(new Blob([serialize(bundle)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = active.taskId + '.mon.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { status(error.message); }
}
$('connect').onclick = () => connect();
$('select-account').onclick = () => connect(true);
$('network').onclick = () => exclusive(async () => { changed(); await wallet.switchToTestnet(); status('已切换网络，请连接账户。'); });
$('run').onclick = start; $('recover').onclick = recover; $('download').onclick = download;
function renderRecoveryOptions() {
  const labels = { createTask: '创建任务', transfer: 'MON 转账', recordPayment: '付款记录', submitEvidence: '证据锚定' };
  for (const option of $('recovery-stage').options) option.textContent = localize(labels[option.value]);
}
document.addEventListener('agentledger:language', renderRecoveryOptions);
renderRecoveryOptions();
$('consent').onchange = render;
for (const id of fields) $(id).addEventListener('input', render);
$('new-run').onclick = () => exclusive(async () => {
  if (!active) return;
  const anyIntent = STAGES.some(stage => localStorage.getItem(RUN_KEY + '.' + active.taskId.toLowerCase() + '.' + stage));
  if (active.state !== 'COMPLETE' && anyIntent) throw Error('原实验存在交易意图，必须先恢复原交易；不能重建实验。');
  // Archive remains, including partial/preflight records; no journal deletion.
  persist(); localStorage.removeItem(RUN_KEY); active = null;
  $('consent').checked = false; seedSteps(); $('result').textContent = '{}';
  status('原记录已保留。现在可以修改参数，新流程需要重新确认。');
});
seedSteps();
try {
  restore();
  if (!active) {
    const deployment = JSON.parse(localStorage.getItem('agentledger.monad-testnet.deployment.v1') || 'null');
    if (ADDRESS.test(deployment?.contractAddress || '')) $('contract').value = deployment.contractAddress;
  }
} catch (error) { blocked = true; status('无法读取本地记录：' + error.message + ' 请保留浏览器数据并核对钱包活动。'); }
wallet.discover(); render();
