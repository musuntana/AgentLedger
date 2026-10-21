# Cloudflare Workers 部署

仓库已提供 Worker 入口、静态资源构建脚本和 `wrangler.jsonc`。本地的两个 Node 服务在云端合并为同一域名下的网页与只读接口，无需在 Worker 中启动监听端口。

## 公网演示入口

**当前提供的演示域名：** [https://monad-hackathon.musuntana.workers.dev/](https://monad-hackathon.musuntana.workers.dev/)（Worker 标识 `monad-hackathon`，GitHub 源码仓库为 `musuntana/AgentLedger`）。

| 地址 | 功能 |
| --- | --- |
| [完整导览 /demo](https://monad-hackathon.musuntana.workers.dev/demo) | 免钱包模拟演示＋可选真实只读 Testnet 查询 |
| [验证室 /studio](https://monad-hackathon.musuntana.workers.dev/studio) | 文件哈希核验与任务只读观察 |
| [工作台 /](https://monad-hackathon.musuntana.workers.dev/) | 钱包签名创建测试网任务 |
| [MON /mon](https://monad-hackathon.musuntana.workers.dev/mon) | 需逐笔签名的测试 MON 实验 |
| [中文讲稿 /pitch/](https://monad-hackathon.musuntana.workers.dev/pitch/) / [English /pitch/en/](https://monad-hackathon.musuntana.workers.dev/pitch/en/) | 在线路演 |
| [Pocket /pocket/](https://monad-hackathon.musuntana.workers.dev/pocket/) | 只读伴随网页 |
| [健康接口 /api/healthz](https://monad-hackathon.musuntana.workers.dev/api/healthz) | 只表示 Worker 服务应答，不证实 Monad RPC 可用 |

以上 URL 依据仓库路由生成；**本次未独立完成公网 HTTP、RPC、钱包与支付验收**。部署是否成功应以 Cloudflare 构建日志、实际网页与 API 调用为准。操作路线见[在线演示指南](online-demo.md)。

## 在创建页面填写

| 字段 | 填写内容 |
| --- | --- |
| 仓库 | `musuntana/AgentLedger`（Worker 名仍为 `monad-hackathon`） |
| 项目名称 | `monad-hackathon`，须与 `wrangler.jsonc` 一致 |
| 构建命令 | `npm run build:cloudflare` |
| 部署命令 | `npx wrangler deploy` |
| 预览命令 | `npx wrangler preview` |
| 生产分支 | `master` |
| 根目录 | 留空，使用仓库根目录 |
| 预览构建 | 可开启，为非生产分支提供预览 |
| Cloudflare Access | 公开演示不勾选；仅供团队访问时再开启并设置访问策略 |

构建环境使用 Node.js 22 或更新版本，保留自动安装 npm 依赖。若需指定版本，可在构建环境变量中设置 `NODE_VERSION=22`。无需填写私钥或钱包助记词。

构建与部署是两个独立步骤；新预览流程默认使用 `wrangler preview`，不是 `wrangler versions upload`。参考 [Cloudflare 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)及[构建环境](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)。

## 部署后入口

将 Cloudflare 提供的域名替换为下面的 `https://你的域名`：

| 路径 | 内容 |
| --- | --- |
| `/` | 测试网工作台 |
| `/demo` | 免钱包演示 |
| `/studio` | 只读验证工作室 |
| `/mon` | 原生 MON 支付实验 |
| `/pitch/` | 中文在线演示文稿（默认落地页） |
| `/pitch/en/` | 英文在线演示文稿 |
| `/pocket/` | Pocket 只读验证网页，查询地址改为同域名，不再访问本机 |
| `/api/healthz` | 服务状态，不代表测试网节点可用 |
| `/api/task` | 验证参数后的只读任务查询 |
| `/api/task-creation` | 核对任务创建交易 |

构建输出位于 `out/cloudflare/public/`，仅包含明确列出的网页、浏览器模块、公开任务引用和编译产物。不会打包 `.env`、本地交易记录、恢复用预备任务、收款回执或证据目录。

Worker 只提供读取接口，不处理支付、签名或任意 RPC 转发。浏览器继续通过 MetaMask 请求逐笔确认，记录和证据保存在该网站来源的浏览器存储中。云端网站与本地网站不共享这些记录；已有交易请在原来源恢复，不能将新网站视为原交易已完成的证明。

默认测试网节点配置在 `wrangler.jsonc` 的 `MONAD_RPC_URL` 中。只有部署配置能指定节点，访客无法通过查询参数更换。使用自有节点时请更新部署配置；带凭证的节点地址应使用 Cloudflare 运行时机密变量，不写入仓库。

在线演示文稿与 Pocket 网页已作为静态资源包含在本 Worker 部署，分别挂载在 `/pitch/`（中英）与 `/pocket/`；x402 付费端点不包含在本次 Worker 部署中。部署个人预备任务文件的本地功能在云端不可用。

## 构建与离线打包

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build:cloudflare
npx wrangler deploy --dry-run --outdir out/cloudflare/bundle
```

历史离线构建记录：使用 Wrangler 4.151.1 成功打包，Worker 压缩后约 109 KiB。该记录只反映当时的构建配置，**不能证明当前公网访问或 RPC/钱包/支付验收通过**。本次文档更新未执行新的云端或链上验收。

在 Cloudflare 创建项目并完成首次部署后，应以平台构建日志和实际访问结果判断是否上线成功。应用测试与公开链验收仍为独立步骤。

## Cloudflare 构建失败时先定位阶段

代码库现已提供默认 `npm run build`（等价于 `npm run build:cloudflare`）和根目录 `.node-version`（固定 Node 22，与 CI 一致）。Cloudflare Workers Builds 的默认 Node 主版本会变化；平台可根据 `.node-version` 自动使用指定版本。GitHub `cloudflare-worker` 门禁会完整编译三套网页、检查必需资源并运行 `wrangler deploy --dry-run`；它**不会进行云端上传，也不能检验账号的 token/预览部署权限**。

若 Cloudflare GitHub Check 仍为红色：

1. 点击 GitHub PR 的 **Workers Builds: monad-hackathon** Check → **Details**，进入 Cloudflare 单次构建日志。确认是在 **Install / Build / Deploy / Preview** 哪一步失败，保留第一条真正的 `Error` 及其上下文（不要粘贴密钥）。GitHub Actions 全绿不能代替这一条 Check。
2. 进入 Cloudflare Worker → **Settings → Build**，确认根目录为仓库根目录、生产分支为 `master`、**Build command** 为 `npm run build` 或 `npm run build:cloudflare`、**Deploy command** 为 `npx wrangler deploy`、**Preview command** 为 `npx wrangler preview`（已启用新版 Preview 时）。不要把 `out/cloudflare/public` 设置成项目根目录。
3. 检查 Build Variables / Secrets 是否错误覆盖 `NODE_VERSION`；应使用 `22`，与根目录版本文件一致。Cloudflare 默认 Node 24 不再作为本项目的可复现构建前提。
4. 如果日志显示 **Build 成功但 Deploy/Preview 鉴权失败**，检查 Cloudflare Workers Builds 的连接授权、Build API Token 和 Preview 设置。这属于平台账号设置，改动 GitHub 代码不能代替重新授权。
5. 如果日志显示入口/资源缺失，请在 GitHub `cloudflare-worker` 门禁查找具体失败文件；如果线上部署显示 404/空白页，再检查域名和 Worker 路由、`assets.directory`，不要将生产部署状态推断为支付成功。

**验收门禁**：同时要求 GitHub `cloudflare-worker` PASS、Cloudflare Workers Builds 的相同 HEAD Check PASS、公开 `/api/healthz` 和 `/demo` 可以访问，才认为“部署成功”。这仍然**不是** Testnet 支付、Agent 执行或链最终性的验收。

**Wrangler 自动准备资源（本轮修复）**：`wrangler.jsonc` 现设 `build.command=node tools/ensure-cloudflare-build.mjs`。即使 Cloudflare 只执行 Deploy / Preview command，Wrangler 也会检查 Studio、Pocket、Pitch 与 manifest 是否完整；缺失时先执行完整 `build:cloudflare`。如果前置 Build command 已经生成完整文件，Wrangler 跳过重复 Expo / Slidev 构建。建议 Cloudflare Build command 使用 `npm run build`，但仍由此钩子兜底资源缺失。首次部署仍需要 Cloudflare 项目自身的合法授权与运行时配额。

## Worker Previews 独立环境配置

Cloudflare 新版 Worker Previews **不会继承生产环境变量**。因此根目录 `wrangler.jsonc` 同时显式声明生产 `vars.MONAD_RPC_URL` 与预览 `previews.vars.MONAD_RPC_URL`，均指向公开 Monad Testnet 只读 RPC。预览绑定不得使用主网端点、含密钥的生产 RPC 或钱包私钥；若改为带凭证的测试节点，使用专属 Preview Secret 而非提交明文 URL。静态资产的 `assets` 配置必须只留在顶层，Cloudflare 会将对应分支的资产上传到 Preview。

仓库新增 `test/cloudflare-preview-config.test.mjs`，由 `npm run test:node` 和 GitHub Actions 自动执行，防止未来意外删掉 Preview RPC。该测试只验证静态配置，**不等于 Worker Preview 已成功创建、云端 RPC 真实可达或支付已完成**。

检查次序：先定位 Cloudflare Workers Builds Check 的首条报错；如 Preview 已生成 URL，在其域名上检查 `/api/healthz`（仅证明服务可达），再针对已知公开任务进行 `/api/task` 只读验收。若 Preview 部署失败但 GitHub dry-run 通过，继续排查 Cloudflare Preview Base 配置、构建授权与账户限制，不能将配置修复表述成已上线。参考 [Cloudflare Worker Previews 配置](https://developers.cloudflare.com/workers/previews/configuration/)。
