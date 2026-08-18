---
doc_id: GOV-HARNESS
title: realvirtual WEB AI Coding Harness
status: approved
owner: engineering
last_reviewed: 2026-08-18
authority: normative-process
---

# realvirtual WEB AI Coding Harness

## 1. 目标

Harness 把文档、架构和工程规则变成可重复命令。本地与 CI 调用同一个根入口 [`../../scripts/verify.sh`](../../scripts/verify.sh)，workflow 不复制业务检查逻辑。

Harness 不自动安装依赖、不升级工具、不启动真实工业连接、不修改 lockfile，也不把自动化验证冒充真实设备验收。

## 2. 命令分层

| 命令 | 内容 | 适用场景 |
| --- | --- | --- |
| `./scripts/verify.sh governance` | Harness 自检、文档元数据/链接/状态、旧文档登记、危险 Agent 命令、发布文档检查 | 所有文档与治理变更 |
| `./scripts/verify.sh static` | governance + ESLint 架构边界 + 公共 TypeScript 检查 + Git whitespace | 常规代码变更 |
| `./scripts/verify.sh node` | Node 环境 Vitest | 纯逻辑、脚本、文件和结构门禁 |
| `./scripts/verify.sh browser` | 浏览器模式 Vitest | 引擎、React、Three.js 行为 |
| `./scripts/verify.sh build` | 公共生产构建 | 打包、公共 Stub 和资源发现 |
| `./scripts/verify.sh e2e` | Playwright 端到端场景 | 关键用户流程和发布前验证 |
| `./scripts/verify.sh all` | static + node + browser + build | 综合交付门禁，不包含真实设备和 E2E |

依赖缺失时 Harness 以环境错误退出，并提示先运行 `npm ci`；它不会自行安装。

## 3. Governance 门禁

- `docs/` 每个目录都有 `README.md`。
- `docs/**/*.md` 都有完整 front matter，`doc_id` 全局唯一。
- `archive`、`references`、`generated`、`delivery/snapshots` 的状态与路径一致。
- Active/Completed ExecPlan 的 `plan_status` 与目录一致。
- Governed Markdown 和 Agent 入口的本地链接存在。
- 每一份根目录 `doc-*.md` 与 `webviewer.mcp.md` 都被旧文档登记表覆盖。
- `.claude/commands` 不包含全局 Node 进程清理、宽泛破坏性 Git/文件命令。
- 现有公开文档发布检查继续通过。

## 4. Static 门禁

- 执行 `npm run lint`，保持 `engine -> viewer/plugin` 等已存在边界失败关闭。
- 执行公共 `tsconfig.json`，不要求不存在的私有 sibling。
- 执行 `git diff --check` 和 `git diff --cached --check`。
- 不在 static 中生成文档、更新快照或自动修复格式。

## 5. 功能门禁选择

| 变更 | 最低建议 |
| --- | --- |
| 纯文档/治理 | governance |
| 纯类型/脚本/算法 | static + node + focused tests |
| React/HMI/Three.js/插件 | static + focused browser tests + build |
| 项目/持久化/Schema | static + node + browser + migration fixtures + build |
| 用户关键流程 | all + focused E2E |
| MCP 工具 | all + `npm run gen:mcp-docs` 后漂移测试 +运行时工具验证 |
| 工业接口或写操作 | all +隔离网关验证；真实设备另行授权和记录 |
| 发布 | all + E2E +目标部署 smoke；根据需要运行 embed 构建 |

## 6. 失败语义与自检

- 规则违反返回 1。
- 缺少工具、依赖或 Harness 内部错误返回 2。
- Governance 检查器通过 [`../../scripts/verify-governance-selftest.mjs`](../../scripts/verify-governance-selftest.mjs) 对 front matter、目录状态、链接提取和危险命令模式做失败样例自检。
- 检查器异常必须失败关闭，禁止 catch 后返回成功。

## 7. CI

`.github/workflows/quality-gates.yml` 在 Pull Request 及 `main`/`develop` push 上运行：

1. 无依赖 Governance Gate；
2. 安装锁定依赖后的 Static Gate；
3. Node + Browser 测试和公共 Build。

首次远程成功前状态是 `configured-pending-remote-run`；分支保护是否强制由 OD-005 决定。CI 不能替代 E2E、真实设备和人工 UX 验收。

## 8. 新增或修改门禁

1. 指向一条 Approved 规则，说明检查范围和已知误报边界。
2. 先增加会失败的自检样例，再实现规则。
3. 本地运行适用命令。
4. 更新 Harness、验收矩阵、ExecPlan 和必要的技术债。
