# AgentLedger

中文 | [English](README.en.md)

**AgentLedger — Pay → Execute → Prove**：基于 Monad Testnet 的 AI Agent 任务与支付证据账本实验原型。通过任务身份记录、支付状态观察、SHA-256 证据校验与异常恢复演示，区分链上记录者的付款声明、真实交易事实和可核验的执行材料。提供免钱包七步演示、只读验证工作室、测试网钱包工作台及独立 MON 支付实验。

**当前状态：实验原型，尚未达到生产可用标准。MON 集成与最近的页面改动尚未完成运行时验收。**

## 在线演示（Cloudflare Workers）

**公开演示：** [AgentLedger 在线入口](https://monad-hackathon.musuntana.workers.dev/) · [免钱包完整导览](https://monad-hackathon.musuntana.workers.dev/demo)

| 功能 | 在线地址 | 说明 |
| --- | --- | --- |
| 完整导览 | [演示 /demo](https://monad-hackathon.musuntana.workers.dev/demo) | 前六步为本地模拟＋浏览器真实哈希计算；第七步可选真实 Testnet 只读查询 |
| 验证工作室 | [Studio /studio](https://monad-hackathon.musuntana.workers.dev/studio) | 文件哈希核验和测试网任务只读查看 |
| 测试网工作台 | [Workbench /](https://monad-hackathon.musuntana.workers.dev/) | 钱包签名部署合约、创建任务 |
| 原生 MON 实验 | [MON /mon](https://monad-hackathon.musuntana.workers.dev/mon) | 需明确同意并逐笔签名的测试 MON 转账实验 |
| 中文 / 英文讲稿 | [中文 /pitch/](https://monad-hackathon.musuntana.workers.dev/pitch/) · [English /pitch/en/](https://monad-hackathon.musuntana.workers.dev/pitch/en/) | 在线路演幻灯片 |
| Pocket | [Pocket /pocket/](https://monad-hackathon.musuntana.workers.dev/pocket/) | 移动端/网页只读演示 |

**推荐操作：**从 /demo 开始，展示任务记录 → 付款声明（仍为 PaymentUnknown）→ 浏览器文本处理与 SHA-256 核验 → 篡改拒绝 → 丢失响应不重复付款。网络可用时再进行可选的第七步 Monad Testnet 真实只读查询。需要写链或 MON 转账时另行连接 MetaMask；不要在免钱包演示中触发真实交易。

**能力边界：**公网网页不等于真实支付成功或生产可用。合约 Paid 是记录者声明，Proven 是摘要锚定，均不独立证明 USDC 付款、Agent 执行正确或链上最终性。Worker 只提供静态资源和只读 API，不保管私钥。钱包日志按浏览器来源隔离，本地 127.0.0.1 与公网域名不能自动互相恢复交易。

该公网地址由项目方提供，**本次文档更新未独立验收线上可访问性、RPC 或钱包交易**。详细步骤见[在线演示指南](docs/online-demo.md)和[演示讲解稿](docs/demo-walkthrough.md)。

## 本地启动

需要 Node.js 22 或更高版本。运行 Python 测试时，另需 Python 3 和 `pytest`。

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

| 入口 | 地址 | 用途 | 是否需要钱包 |
| --- | --- | --- | --- |
| 完整演示 | <http://127.0.0.1:4322/demo> | 约三分钟了解任务、支付声明和证据核验 | 不需要 |
| 测试网工作台 | <http://127.0.0.1:4322> | 部署账本合约、创建任务、恢复原交易 | 写入时需要 |
| 验证工作室 | <http://127.0.0.1:4322/studio> | 查询测试网任务、核验本地证据 | 不需要 |
| MON 支付实验 | <http://127.0.0.1:4322/mon> | 测试币转账、付款记录和证据锚定 | 需要 |
| 独立验证服务 | <http://127.0.0.1:4321> | 单独使用只读验证工作室 | 不需要 |

页面右上角可切换中英文。语言设置仅影响显示文案，不改写任务输入、签名参数、哈希或导出记录。

签名操作需要在安装了 MetaMask 扩展的电脑浏览器中完成。远程开发时，转发 **4322** 即可使用完整工作台和同源验证工作室；使用独立验证服务时还需转发 **4321**。手机上的 `127.0.0.1` 指向手机自身，目前未实现手机扫码连接钱包。

`npm run dev` 在前台管理它启动的两个服务，按 Ctrl+C 可停止，不会终止其他已占用端口的进程。也可分别运行 `npm start` 和 `npm run deploy:testnet`。

## 部署到 Cloudflare

在 Cloudflare 中连接本仓库，选择生产分支 `master` 和仓库根目录：

| 设置 | 值 |
| --- | --- |
| 构建命令 | `npm run build:cloudflare` |
| 部署命令 | `npx wrangler deploy` |
| 预览命令 | `npx wrangler preview` |
| 项目名称 | `monad-hackathon` |

公开演示无需开启访问保护；需要团队登录限制时再配置 Cloudflare Access。构建环境需要 Node.js 22 或更新版本，无需提供钱包私钥。网页和只读接口部署到同一域名；本地交易记录不会迁移到新域名。

公开演示 URL 已列出，但当前托管状态与 RPC 可用性仍需独立验收。详细范围和配置见 [Cloudflare 部署说明](docs/cloudflare-deployment.md)。

## 先看免钱包演示

打开完整演示，选择开始本地演示。前六步可离线运行，第七步为可选的测试网只读查询。

| 步骤 | 展示内容 | 数据来源 |
| --- | --- | --- |
| 1. 任务记录 | 将原始输入的 SHA-256 绑定到任务标识 | 本地模拟 |
| 2. 付款声明 | 展示记录者的付款声明，支付状态仍为 `PaymentUnknown` | 本地模拟 |
| 3. 工具输出 | 计算文本统计，提供原始输入和输出下载 | 浏览器实际计算；账本锚点为模拟数据 |
| 4. 证据核验 | 比对规范化证据及输入、输出的 SHA-256 | 浏览器本地计算；链上锚点为模拟数据 |
| 5. 篡改检测 | 修改一个输出字节后，展示核验失败 | 浏览器本地核验 |
| 6. 响应丢失 | 展示支付结果未知时的恢复边界，不自动重复付款 | 本地模拟 |
| 7. 公开任务 | 重新查询公开任务的创建交易和当前状态 | 真实测试网只读查询，依赖网络可用性 |

公开任务引用来自 `phase0/demo-showcase.json`，仅提供查询身份，不代表部署已获审批或当前查询一定成功。连接失败、任务缺失和身份不匹配都会显示为失败，不会改用模拟数据冒充链上结果。

本地证据场景可下载 `evidence.json`、`input.txt` 和 `output.json`，再选择这些文件重新核验。导出的 `summary.json` 会保留数据来源；重新开始演示只重置本地模拟，不删除钱包交易记录。演示操作见[演示讲解稿](docs/demo-walkthrough.md)。

## 部署并创建测试网任务

1. 在工作台连接 MetaMask，选择 Monad 测试网，链 ID 为 **10143**。
2. 核对记录账户 `paymentRecorder`。它拥有付款声明记录权限，部署后不能更改；切换钱包账户不会修改合约权限。
3. 领取测试 MON 后刷新余额，检查部署费用，再到钱包确认部署。
4. 检查原部署交易。工作台会核对交易参数、区块、运行时代码和记录账户；重连后也会核对已有部署。
5. 填写任务输入和正整数预算上限，检查创建费用，再到钱包确认。此入口的预算使用 USDC 最小单位，`1000` 对应 `0.001 USDC`，仅约束付款声明金额。
6. 创建后自动读取链上状态，核对原交易、`TaskCreated` 事件和任务参数，成功后进入同源验证工作室。等待回执时只会有限次重查，不会重新发送交易；也可手动检查原交易。

刷新页面会恢复部署和任务记录。若钱包未返回交易哈希，请从 MetaMask 活动中找到原哈希，再使用恢复入口核对。已经保存签名请求的参数会锁定，以便恢复；不要因为响应缺失而重复部署或创建任务。请下载并保留原始记录。

该工作台只部署合约和创建任务，不发起 USDC 支付，不调用 `recordPayment`，也不执行智能体。部署不会自动加入已审批部署登记表。详见[工作台与恢复说明](docs/testnet-workspace.md)。

## MON 支付实验

此入口是独立的原生 MON 流程，金额按 MON 填写，链上最小单位为 wei；不能按 USDC 金额解释。

1. 先在工作台部署并核对合约，将付款账户 A 设为记录账户。
2. 打开 MON 支付实验，连接账户 A，填写你控制的另一普通账户 B、金额和任务说明。页面不预置收款地址。
3. 核对转账摘要并勾选确认选项。钱包会依次请求四笔交易确认：创建任务、MON 转账、记录付款、锚定证据。
4. 查看流程进度并下载记录。中断后继续原流程；钱包响应未知时，先恢复原交易哈希。

交易意图、参数和证据保存在当前浏览器中，不上传服务器。原交易记录用于防止重复发送；同源标签页通过浏览器锁互斥。不同浏览器、设备或来源不共享这个锁，请在原浏览器恢复。

MON 证据使用 `agentledger.mon-payment.v1`；工具执行证据使用 `agentledger.evidence.v1`，两种格式不能互换。结果来自钱包连接的节点，不代表独立的 USDC 支付验收或交易终局性保证。历史余额查询不受支持或同一区块存在其他收款活动时，核对可能中断，不会因此重新转账。

代码参考队友项目的固定提交 [`5742899`](https://github.com/linyuze/monadevidence/tree/5742899190d07410740b08d8cfb118955cb9a371/agentledger-mon)。适配范围、恢复方式和未完成的验收见[MON 集成说明](docs/mon-payment-integration.md)。

## 如何理解页面状态

| 状态或结果 | 表示什么 |
| --- | --- |
| `Created` | 合约已记录任务 |
| `Paid` | 记录者声称付款已发生 |
| `Proven` | 合约保存了证据摘要 |
| `PaymentUnknown` | 尚未独立确认支付结果，不等于未付款或付款失败 |
| SHA-256 一致 | 参与比较的字节与摘要一致，不证明智能体执行正确 |

对外观察状态包括 `Created`、`PaymentUnknown`、`PaymentObserved`、`PaymentRecorded`、`EvidenceAnchored` 和 `Conflict`，与合约存储状态分开。支付结果未知时，不自动重复扣款、复用授权随机数或释放预留。详见[事实与状态约定](docs/phase0-contract.md)和[支付审批威胁模型](docs/payment-approval.md)。

## 移动端伴随应用与演示材料

`apps/pocket` 是独立的 Expo 应用，支持移动端和网页只读观察，提供任务、支付观察、证据核验和响应丢失演示。它在设备上核验规范化 SHA-256 和原始文件，通过本地验证服务的 `GET /api/task` 查询真实任务，不签名、不写链。证据文件上限为 2 MiB，输入和输出各为 10 MiB，文本按严格 UTF-8 处理。

在两个终端中分别启动：

```bash
# 终端一：在仓库根目录启动验证服务
npm start
```

```bash
# 终端二：安装并启动伴随应用
cd apps/pocket
npm ci --ignore-scripts --no-audit --no-fund
npm run web
```

网页地址通常为 <http://localhost:8081>。详见[伴随应用说明](apps/pocket/README.md)和[历史只读验收记录](docs/pocket-testnet-acceptance.md)；历史记录不代表当前版本已通过验收。

评委展示优先使用七页讲稿：[中文版](slides/judge.md)与[英文版](slides/judge.en.md)。完整技术附录为 `slides/slides.md`。

```bash
cd slides
npm ci --ignore-scripts --no-audit --no-fund
npm run build:judge
npm run build:judge:en
```

导出与展示方式见[演示材料说明](slides/README.md)。赛事报名与提交由参赛者手动完成，详见[提交准备说明](docs/monad-blitz-submission.md)。

## 只读开发工具包

`sdk` 提供可通过 GitHub 预发行归档安装的 `@agentledger/verify@0.1.0`，包含 `observe`、`verify` 和仅核对回执的 `reconcile`。回执核对本身不能将支付状态升级为已验证；安装命令、接口、错误码和约束见[工具包说明](sdk/README.md)。

## 验证命令与当前边界

以下为可用命令，不表示本次已执行或通过。本轮仅调整文案与文档，未运行应用测试、浏览器验收或链上交易；MON 集成仍待单独验收。

| 命令 | 范围 |
| --- | --- |
| `npm test` | Node.js、工具包与 Python 测试 |
| `npm run onsite:check` | 离线演示准备检查 |
| `npm run submit:check` | 离线检查展示链接与敏感文件，不上传或提交项目 |
| `npm run test:pocket` | 伴随应用单元测试 |
| `npm run test:pocket:typecheck` | 伴随应用类型检查 |
| `npm run test:browser` | 本地模拟的浏览器检查 |
| `npm run test:browser:anvil` | 本地 Anvil 合约与浏览器检查 |
| `npm run test:browser:live` | 真实测试网只读查询，需要本地服务运行 |

浏览器检查需要 Chrome 或 Chromium，可通过 `AGENTLEDGER_CHROME_PATH` 指定路径；Anvil 检查另需 Foundry。伴随应用还有独立的 `test:browser:live` 命令，会将只读观察记录写入 `out/pocket-live-testnet/`；该目录采用只写一次的方式，重跑前应先保留历史证据，再处理原输出目录。

持续集成配置见[工作流](.github/workflows/ci.yml)，实际执行情况以对应提交的运行结果为准。公开测试网支付的正式验收要求见[验收说明](docs/live-testnet-observation.md)。

## 评委快速导航与诚实结果（Verification Matrix）

| 我想验证什么 | 去哪里 | 结论范围 |
| --- | --- | --- |
| 任务创建、付款声明、证据、篡改、丢 ACK | `/demo` → Honest Results | **LOCAL / SIMULATED ONLY**；实际本地哈希运算不代表链上付款 |
| 当前公共链任务身份及创建交易 | `/studio` → Testnet lookup | **TESTNET / READ ONLY**；需逐次读取并核对原始回执 |
| 提交原始文件重新核验摘要 | `/studio` → Evidence lab | 字节一致 ≠ 执行正确 ≠ 付款最终性 |
| 自行确认真实测试 MON 转账 | `/mon` | 独立实验，钱包逐笔签名；不是 USDC/x402 验收 |

**Honest Results 面板**按 Claim / Checked by / State 显示当前已检查和未检查的事实：`PaymentUnknown`、`NOT_VERIFIED` 及 `TAMPER_REJECTED` 会保留，而不是统一显示绿色通过。Lost ACK 只能恢复原始付款事实，不允许根据超时自动再次扣费（**NO RECHARGE**）。

`summary.json` 的 `metrics.readPathLatencyMs` 是浏览器 → 服务 → RPC 的端到端读取耗时，**不是 RPC 服务端延迟，也不代表区块确认时间**；只有创建交易回执与规范区块经过核对，`creationReceiptBlockNumber`、`creationReceiptBlockHash` 才非空。当前 Studio 没有独立的支付回执与 Evidence 锚定回执，因此 `paymentToEvidenceBlockSpan`、`writeGasUsedWei` 必须为 `null`。本地模拟中的所有链上观测指标也必须为 `null`，不能编造 Monad 并行效率数字。

**常见异议：为什么把记录放在链上？** 用不可随意改写的任务状态和摘要锚点提供公开可查询的参照；链本身不负责判断业务执行质量，不能替代独立支付对账、执行证明和最终性政策。**Proven 能否证明执行正确？** 不能；它只表示摘要已被允许的提交者锚定。**是否能声称真实 USDC 支付完整验收？** 当前 reviewed deployment 列表为空，不能，须保留 `BLOCKED_NO_REVIEWED_DEPLOYMENT`。
