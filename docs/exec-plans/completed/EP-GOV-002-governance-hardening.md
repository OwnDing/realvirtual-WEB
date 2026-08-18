---
doc_id: EP-GOV-002
title: 加固文档治理与 AI 安全门禁
status: approved
plan_status: completed
owner: architecture
last_reviewed: 2026-08-18
authority: normative-process
---

# EP-GOV-002：加固文档治理与 AI 安全门禁

## Purpose

让文档元数据、目录索引、ExecPlan 状态、Agent 命令安全和远程 Quality Gates 的实际约束与 Approved 治理文档一致，并能通过失败样例证明规则不会静默失效。

## Scope

- 统一 `status`、`authority`、`owner` 元数据词汇和合法组合；
- 修复 CRLF、特殊目录索引状态、ExecPlan 放置和目录 membership 检查；
- 扩大危险命令检查的模式和可执行指令面；
- 为 Claude Code 增加与 `AI_SAFETY.md` 对应的运行时 deny 规则；
- 更新远程 CI 实际状态、已知偏差和 Harness 的真实覆盖范围；
- 修复 Quality Gates 当前暴露的治理兼容性和测试漂移，使仓库侧门禁具备成为 required checks 的条件；
- 建立 i18n 增量治理的 Proposed ExecPlan，但不决定 OD-002。

## Non-goals

- 不替用户修改 GitHub branch protection、ruleset、远程分支或 Actions 设置；
- 不提交、推送、发布或部署；
- 不选择 i18n 框架、首批语言、回退链或翻译责任；
- 不修改运行时产品行为、公共 Schema、设备组装或配置优先级；
- 不逐份批准根目录旧技术文档。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-CHANGE`、`GOV-DOD`、`GOV-HARNESS`；
- OD-002 保持 open，只允许建立 i18n 债务盘点和增量闸口计划；
- OD-005 保持 open，直到 maintainer 明确远程 required checks 和分支保护策略；
- OD-006 保持 open，根旧文档继续作为 reference。

## Current Repository Facts

- 开始时分支为 `develop`，工作区干净，HEAD 为 `bfb8855`；
- Quality Gates run `32151338635` 已执行：Governance Gate 与 Static Gate 通过，Node job 有 3 个失败；
- `main`、`develop` 当前均无 branch protection，仓库无 ruleset；
- 根 Markdown 链接已由 `assert-docs-publishable.mjs` 覆盖，缺口是旧文档内容审计，不是零链接检查；
- `verify-governance.mjs` 未校验 `authority`、`owner`、目录索引 membership 和文档新鲜度，且 CRLF、特殊目录 README、ExecPlan 根目录存在绕过或误判；
- `.claude/settings.json` 当前允许 `Bash(*)` 且 deny 为空；本地 `pre-push` 仅运行 Git LFS，没有 pre-commit 治理 hook。

## State Ownership and Compatibility

本计划只改变治理元数据、验证和测试证据，不改变 GLB、rv-ODT、项目文档、配置、信号或运行时状态所有权。客户工作区文档过滤的修复必须保持原交付边界，只处理新增治理链接的兼容性。

## Allowed Paths

- `.claude/settings.json`
- `.github/workflows/quality-gates.yml`
- `docs/**`
- `scripts/verify-governance.mjs`
- `scripts/verify-governance-selftest.mjs`
- `scripts/verify.sh`
- `scripts/_workspace-lib.mjs`（只修复治理入口链接的客户工作区过滤）
- `tests/embed-vignette.node.test.ts`
- `tests/connect-embed-boot.node.test.ts`
- `tests/connect-embed-connection.node.test.ts`

## Forbidden Paths

- `src/**`
- `schema/**`
- `public/**`
- 其他产品测试、E2E、部署配置和真实设备接口

## Milestones

1. 建立机器可读元数据策略，补齐元数据、CRLF、README、ExecPlan 和索引 membership 失败样例。
2. 扩大危险指令模式和扫描面，校验 Claude Code deny 规则。
3. 更新 Harness、验收矩阵、已知偏差与远程 CI 事实。
4. 修复当前 3 个 Node 失败，运行 governance、static、node、browser、build。
5. 建立 Proposed `EP-I18N-001`，记录停止新增债务、关闭 OD-002 和黄金切片顺序。

## Progress

- [x] 对照外部评审与当前代码、测试、GitHub Actions 状态。
- [x] 用户确认吸收经复核后的治理建议。
- [x] 元数据策略与结构检查完成。
- [x] AI 命令安全与 Claude 权限检查完成。
- [x] 文档事实、Known Deviations 和 Proposed i18n 计划同步。
- [x] Governance、Static、Node 和公共 Build 通过；Browser 因本机缺少 Playwright Chromium 未进入测试并已披露。

## Surprises & Discoveries

- 外部评审所称“根目录文档链接零检查”不符合当前实现：`verify.sh governance` 已调用覆盖全部候选 Markdown 的发布检查器。
- Quality Gates 已远程运行，不是 `configured-pending-remote-run`；治理和静态 job 成功，但整个 workflow 仍因 Node 测试失败而为红色。
- Proposed ExecPlan 没有合法目录，模板与目录规则互相矛盾，需要新增 `proposed/`。
- 新增根 `AGENTS.md` 链接进入客户工作区 README 后，现有过滤器没有将其重定向或降级为文本，触发构建输入断链。
- 修复最初 3 个 Node 失败后，全量套件暴露 `embed-vignette` 构建与 `embed-spike` 扫描共享 `dist-embed/` 的竞态；测试构建必须使用独立临时输出，不能靠串行顺序或重跑掩盖。
- 隔离竞态后，正式 rv-embed 构建仍产生 React/MUI 动态 chunk；guard 在干净 CI 因产物不存在而跳过。这是超出本计划运行时禁区的既有产品偏差，登记为 KD-003，不将公共 Build 绿色冒充 embed 隔离完成。

## Decision Log

- 2026-08-18：用户同意吸收评审中经仓库事实复核后的建议，并按治理加固、i18n 规划、产品规格的顺序推进。
- 2026-08-18：统一 Draft/模板的 authority 为 `proposed`；特殊内容目录的 README 作为 `approved + normative-registry` 索引，目录中的内容文档继续强制 reference/generated/snapshot/superseded 状态。
- 2026-08-18：本地 hook 只作为可选反馈，不作为 P0 强制证据；强制层由 CI required checks 承担，OD-005 在外部配置完成前保持 open。

## Validation

- `./scripts/verify.sh governance`：通过，33 份 governed 文档，发布链接检查通过。
- `./scripts/verify.sh static`：通过，包含 Governance、ESLint 边界和公共 TypeScript。
- `./scripts/verify.sh node`：通过，49 个文件/458 个测试通过，3 个文件/9 个测试按既有产物条件跳过；KD-003 记录 rv-embed 证据缺口。
- `./scripts/verify.sh browser`：未进入测试，本机缺少 Playwright Chromium `1208`；CI Browser Gate 已显式安装 Chromium。
- `./scripts/verify.sh build`：公共生产 Build 通过。
- `git diff --check`：通过。
- 正式 `npx vite build --config vite.embed.config.ts`：构建成功，但随后 `embed-spike.node.test.ts` 发现 React/MUI forbidden marker；登记 KD-003，不计作通过。
- 远程 CI 与 branch protection 本轮未写入；需要后续提交/推送和 maintainer 配置证据，OD-005 保持 open。

## Rollback

治理检查器和策略文件可按同一变更整体回退；Claude deny 规则可恢复原配置；CI job 拆分可恢复为组合 job。没有 Schema、产品数据或外部系统状态需要回滚。

## Outcomes & Retrospective

文档治理从“字段存在”提升为机器校验的状态/权威/Owner 组合、目录 membership、跨平台 front matter、计划放置和复审 warning；Claude deny 与跨工具危险指令扫描形成纵深防御。Quality Gates 拆分后能够独立暴露 Node、Browser、Build 结果，原远端 3 个 Node 失败已在本地修复。

未关闭事项保持诚实：OD-005 等待远程 required checks；OD-006 等待旧文档逐份审计；KD-001/KD-002 分别等待 i18n 与稳定端口决策；新发现的 KD-003 需要独立 rv-embed 产品计划。Proposed EP-I18N-001 只冻结实施顺序，没有越过 OD-002 选择框架。
