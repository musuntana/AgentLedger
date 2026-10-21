# AgentLedger 在线演示指南

**在线入口：** [Cloudflare 完整演示](https://monad-hackathon.musuntana.workers.dev/demo) · **仓库：** https://github.com/musuntana/AgentLedger

> 公网 URL 由项目方提供。本指南根据当前 GitHub Worker 路由编写，未独立完成远端访问、RPC、钱包交易或链上验收；演示前应检查可达性和 Cloudflare 部署日志。

## 评委三分钟免钱包演示

1. 进入 [/demo](https://monad-hackathon.musuntana.workers.dev/demo)，点击「开始完整演示」。
2. **Task**：记录输入 SHA-256、任务标识；这里是本地模拟，不创建真实链上任务。
3. **Payment**：展示合约 Recorder 的 Paid 声明，同时保留 `PaymentUnknown`；并无独立核验的 USDC 支付。
4. **Tool output / Evidence**：浏览器真实计算文本统计及输入、输出和规范化 Evidence SHA-256，但链上锚点是模拟值。可下载 `input.txt`、`output.json`、`evidence.json` 并上传复核。
5. **Tamper**：改变一个输出字节，校验应拒绝；字节一致不等于 Agent 执行正确。
6. **Lost ACK**：响应丢失也不自动重复扣款（NO RECHARGE），付款状态依然未知。
7. **可选 Testnet 只读查询**：RPC 可用时检查固定公开任务及其创建交易、任务身份与当前状态；此步不属于上述模拟支付流程。

导出 `summary.json`，检查 `LOCAL_SIMULATION`、`TESTNET_TASK_READ_ONLY` 及失败状态，不把模拟 Paid/Proven 宣称为真实付款。

## 公网导航

| 页面 | 地址 | 说明 |
| --- | --- | --- |
| 免钱包导览 | [/demo](https://monad-hackathon.musuntana.workers.dev/demo) | 推荐评委首先访问 |
| 验证工作室 | [/studio](https://monad-hackathon.musuntana.workers.dev/studio) | 原始文件/哈希核验，可选真实链上只读 |
| 测试网工作台 | [/](https://monad-hackathon.musuntana.workers.dev/) | 钱包部署合约与创建任务，需逐笔签名 |
| MON 转账实验 | [/mon](https://monad-hackathon.musuntana.workers.dev/mon) | 独立测试币交易，非 USDC/x402 验收 |
| 中文/英文路演 | [中文](https://monad-hackathon.musuntana.workers.dev/pitch/) · [English](https://monad-hackathon.musuntana.workers.dev/pitch/en/) | 在线演示幻灯片 |
| Pocket 伴随网页 | [/pocket/](https://monad-hackathon.musuntana.workers.dev/pocket/) | 只读观察与本地哈希核验 |
| 服务检查 | [/api/healthz](https://monad-hackathon.musuntana.workers.dev/api/healthz) | 只能证实 Worker 健康接口响应，不证实 RPC 或支付成功 |

## 操作与安全边界

Cloudflare Worker 提供静态资源及只读 API（如 `GET /api/task` 和 `GET /api/task-creation`），不持有钱包私钥、不进行服务器自动支付。写链功能通过浏览器 MetaMask 在 Monad Testnet（chainId **10143**）完成，每一笔交易应由使用者明确批准。

交易意图与恢复日志保存在当前浏览器来源内。公网域名、localhost、其他设备和浏览器配置并不共享交易日志；结果未知时找回**原交易哈希**并核对，**不要因为丢 ACK 就重新付款**。`Created` 是任务事实，`Paid` 是记录者声明，`Proven` 是证据摘要锚定；均不构成独立支付或 Agent 正确性证明。

## 现场核对

先打开 /demo 验证页面加载及六步操作、文件核验，再检查 /pitch/、/pitch/en/、/pocket/。如需要真实公开任务，则先确认 `/api/healthz` 响应，再实际查询已知任务的 `/api/task` 并核对交易回执，失败时如实说明。**这是建议验收步骤，不是本次已通过的测试。**

公网不可用时，在仓库根目录执行 `npm ci --ignore-scripts --no-audit --no-fund` 和 `npm run dev`，访问 <http://127.0.0.1:4322/demo>。详见[演示稿](demo-walkthrough.md)与[Cloudflare 部署说明](cloudflare-deployment.md)。
