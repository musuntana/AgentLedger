# Cloudflare Workers 部署

仓库已提供 Worker 入口、静态资源构建脚本和 `wrangler.jsonc`。本地的两个 Node 服务在云端合并为同一域名下的网页与只读接口，无需在 Worker 中启动监听端口。

## 在创建页面填写

| 字段 | 填写内容 |
| --- | --- |
| 仓库 | `musuntana/monad-hackathon` |
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

本次已完成构建及 Wrangler 4.151.1 离线打包，Worker 压缩后约 109 KiB。该结果仅说明构建配置与打包通过，**没有执行 Cloudflare 上传、云端验收、应用测试或钱包交易**。

在 Cloudflare 创建项目并完成首次部署后，应以平台构建日志和实际访问结果判断是否上线成功。应用测试与公开链验收仍为独立步骤。
