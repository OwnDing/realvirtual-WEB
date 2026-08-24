---
doc_id: GOV-HARNESS
title: XYvirtual WEB AI Coding Harness
status: approved
owner: engineering
last_reviewed: 2026-08-23
authority: normative-process
---

# XYvirtual WEB AI Coding Harness

## 1. 目标

Harness 把文档、架构和工程规则变成可重复命令。本地与 CI 调用同一个根入口 [`../../scripts/verify.sh`](../../scripts/verify.sh)，workflow 不复制业务检查逻辑。

Harness 不自动安装依赖、不升级工具、不启动真实工业连接、不修改 lockfile，也不把自动化验证冒充真实设备验收。

## 2. 命令分层

| 命令 | 内容 | 适用场景 |
| --- | --- | --- |
| `./scripts/verify.sh governance` | Harness 自检、文档元数据/链接/状态、旧文档登记、危险 Agent 命令、发布文档检查 | 所有文档与治理变更 |
| `./scripts/verify.sh static` | governance + ESLint 架构边界 + 公共 TypeScript 检查 + Git whitespace | 常规代码变更 |
| `./scripts/verify.sh node` | Node 环境 Vitest | 纯逻辑、脚本、文件和结构门禁 |
| `./scripts/verify.sh browser` | 浏览器模式 Vitest；主套件以八个顺序、独立 Chromium 进程的互补 shard 全量运行，性能套件单独运行；不隐式构建 `dist/` | 引擎、React、Three.js 行为；包体积测试前先运行 build |
| `./scripts/verify.sh build` | 公共生产构建 | 打包、公共 Stub 和资源发现 |
| `./scripts/verify.sh e2e` | Playwright 端到端场景 | 关键用户流程和发布前验证 |
| `./scripts/verify.sh all` | static + node + browser + build | 综合交付门禁，不包含真实设备和 E2E |

依赖缺失时 Harness 以环境错误退出，并提示先运行 `npm ci`；它不会自行安装。

## 3. Governance 门禁

- `docs/` 每个目录都有 `README.md`。
- `docs/**/*.md` 都有完整 front matter，`doc_id` 全局唯一，`status`、`authority`、`owner` 和组合符合机器策略。
- 每个目录 README 直接索引同目录 Markdown；CRLF/LF front matter 都按同一规则解析。
- 特殊内容目录的 README 是 Approved 索引，目录中的 archive/reference/generated/snapshot 内容状态与路径一致。
- Proposed/Active/Completed ExecPlan 的 `plan_status` 与目录一致，根目录只允许索引和模板。
- Governed Markdown 和 Agent 入口的本地链接存在。
- 每一份根目录 `doc-*.md` 与 `webviewer.mcp.md` 都被旧文档登记表覆盖。
- `.claude/commands`、活动 ExecPlan/Agent 入口的 shell 代码块、workflow 和 package scripts 不包含宽泛破坏性命令。
- Claude Code 必须具备与 AI 安全规则对应的 deny 配置；该配置不替代跨工具 Governance Harness。
- Approved 文档超过机器策略复审周期时输出 warning，但不只按日期自动撤销权威性。
- 现有公开文档发布检查继续通过。

## 4. Static 门禁

- 执行 `npm run lint`，保持 `engine -> viewer/plugin` 等已存在边界失败关闭。当前可证明的语义覆盖是已配置的边界规则；为兼容缺失私有 sibling 注册的 no-op 规则名不提供额外 Lint 保证。
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
3. 独立的 Node Gate、Browser Gate 和 Build Gate，使一个失败不会遮蔽其他证据；
4. Browser Gate 固定使用 Ubuntu 24.04，显式拉取 Git LFS、先生成 `dist/`，再安装与锁定 Playwright 版本匹配的 Chromium；主套件以八个顺序、独立 Chromium 进程的确定性 shard 全量运行，性能套件在第九个进程运行，并输出临时盘/主机可用内存最低值。任一进程非零即整项失败；安装、测试和 job 分别以 10、20、35 分钟上限失败关闭，且安装关键路径不执行 APT。

2026-08-18 的首次远程 run `32151338635` 中 Governance Gate 与 Static Gate 通过，组合测试 job 因 3 个 Node 测试失败而失败。拆分后的远程 run `32157736678` 中 Governance、Static、Node、Build 通过，旧 Browser job 因 LFS/`dist` 输入缺口和无界名称探测在 GitHub 6 小时上限被取消。EP-GOV-003 完成后，远程 run `32222458677` 在提交 `47f9807` 上五个 Gate 全部通过；Chromium 安装耗时 8 秒，Browser Harness 用时 7 分 17 秒，944 个文件、10,366 个测试通过。

上述 EP-GOV-003 首次远程验证时，`main`、`develop` 尚无 branch protection。OD-005 已于 2026-08-23 关闭：两个分支现在都要求 Governance、Static、Node、Browser、Build 五项检查，`strict` 且管理员不可绕过，禁止强推和删除。

2026-08-23 的文档 PR Browser run `32625669475` 两次在 1,025 文件 / 10,822 例已通过、零断言失败后发生 import/runner 基础设施错误；包含同一提交的 run `32625805452` 随后全绿。EP-GOV-004 M4 因此在不移除 required check、不重试和不缩小套件的前提下引入上述进程分片。初版两分片在远程重复时仍复现 import flake；四分片实现提交 `bffbaf9` 随后由 PR #3 run `32629737449` attempts 1/2/3 验证，五项 Gate 三轮全绿，Browser 分别 10:02 / 12:06 / 9:07。四分片后来再次失败；八分片实现提交 `ac769d4` 虽由 run `32735488742` attempts 1/2/3 连续全绿，关闭提交 run `32740819707` 仍在 128 文件 / 1309 例通过后复现。最终方案使用正式回移上游根因修复的 Vitest 4.1.11，在门禁中强制每文件 Chromium GC，并保留八分片作为第二层生命周期边界；本地完整 Browser 已连续两轮通过，远程重复验收仍为合入条件。CI 不能替代 E2E、真实设备和人工 UX 验收。

## 8. 新增或修改门禁

1. 指向一条 Approved 规则，说明检查范围和已知误报边界。
2. 先增加会失败的自检样例，再实现规则。
3. 本地运行适用命令。
4. 更新 Harness、验收矩阵、ExecPlan 和必要的技术债。
