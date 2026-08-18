---
doc_id: EP-GOV-001
title: 建立 AI Coding 文档治理基座
status: approved
plan_status: completed
owner: architecture
last_reviewed: 2026-08-18
authority: normative-when-accepted
---

# EP-GOV-001：建立 AI Coding 文档治理基座

## Purpose

让开发者和 AI Agent 从统一、工具中立的入口工作，能够识别文档权威性、安全边界、复杂任务计划、决策闸口和完成证据。

## Scope

- 根 `AGENTS.md` 和短 `CLAUDE.md` 兼容入口；
- 文档状态、优先级、宪法、AI 安全、变更管理、DoD、仓库事实与未决事项；
- ExecPlan、ADR、验收、架构、契约、产品规格及历史目录；
- 根目录旧技术文档登记；
- Governance/Static/Test/Build Harness 和 GitHub Quality Gates；
- 清理 `.claude/commands/dev.md` 的全局 Node 进程终止指令。

## Non-goals

- 不修改运行时、UI、仿真、Planner、Schema 或工业接口业务行为；
- 不逐份审计和迁移现有 22 份根技术文档；
- 不决定 i18n、配置优先级、服务端平台和装配端口迁移方案；
- 不运行真实设备、CONNECT、MCP 写工具或生产部署验收。

## Required Documents and Decisions

本计划是治理基座的首次建立，由用户在当前任务中明确批准。后续变更受新治理文档约束。

## Current Repository Facts

- 基线为 `develop`，项目版本 `6.3.27`；
- 原 `CLAUDE.md` 包含与当前 remote/branch 不一致的内部仓库说明；
- 原 `/dev` 命令会终止全部 Node 进程；
- 已有大量技术文档和测试，但缺少统一状态、权威顺序、ExecPlan/ADR/DoD 与 PR Quality Gate。

## State Ownership and Compatibility

只新增治理文件和验证入口；不改变产品持久化状态或公共运行时契约。

## Allowed Paths

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/commands/*.md`
- `docs/**`
- `scripts/verify*.mjs`
- `scripts/verify.sh`
- `.github/workflows/quality-gates.yml`
- `package.json`
- `eslint.config.js`（仅在现有最小规则 Stub 漂移阻断 static gate 时）
- `README.md`
- `CONTRIBUTING.md`
- `doc-unity-to-web.md`（只同步 Agent 入口，不提升其治理状态）

## Forbidden Paths

- `src/**`
- `schema/**`
- `public/**`
- `tests/**`
- `e2e/**`

## Milestones

1. 建立工具中立入口和治理文档。
2. 建立模板、目录索引和旧文档登记。
3. 建立带自检的 Governance Harness、静态/测试/构建根入口和 CI。
4. 运行治理门禁、发布文档检查和 Git diff 检查。

## Progress

- [x] 工具中立 Agent 入口与文档中心。
- [x] 宪法、AI 安全、文档优先级、变更管理与 DoD。
- [x] ExecPlan、ADR、验收与标准目录。
- [x] Harness、自检、根验证脚本和 CI 配置。
- [x] 安全化 Claude 开发服务器命令。

## Surprises & Discoveries

- 原 `CLAUDE.md` 的 Git remote/branch 说明已与当前仓库事实漂移，证明治理入口不能硬编码易变事实。
- 根技术文档共 22 份，直接搬迁会制造大量断链，因此采用登记表和逐份审计策略。
- 现有 `assert-docs-publishable.mjs` 已覆盖公开镜像断链和内部文档误发布，应复用而不是重复实现。
- Static gate 暴露 `@typescript-eslint/no-implied-eval` 禁用注释已存在、最小 ESLint 配置却未注册规则名；按现有 Stub 机制补齐，未扩大或缩小实际 Lint 规则集。

## Decision Log

- 2026-08-18：采用 `AGENTS.md` 作为工具中立短入口，`CLAUDE.md` 仅作兼容跳转。
- 2026-08-18：旧根文档先统一登记为 reference，不在未审计时虚假升级为 Approved。
- 2026-08-18：综合 `all` 不包含 E2E 和真实设备验收，避免把环境性验证伪装成普适门禁；关键流程由 ExecPlan 显式选择 E2E。

## Validation

- `./scripts/verify.sh governance`
- `node scripts/assert-docs-publishable.mjs`
- `git diff --check`

本计划不修改业务代码，因此不要求全量浏览器测试；若 package/脚本集成触发静态问题，再运行 `./scripts/verify.sh static`。

## Rollback

删除新增治理目录、Harness/CI 文件，恢复原 `CLAUDE.md`、`.claude/commands/dev.md` 和 `package.json` 脚本即可；没有产品数据或外部系统回滚。

## Outcomes & Retrospective

治理入口、标准目录、模板、文档门禁和 CI 配置已建立。根技术文档仍处于待审计 reference 状态；i18n、配置层级、平台后端和稳定装配端口方案作为未决事项保留。
