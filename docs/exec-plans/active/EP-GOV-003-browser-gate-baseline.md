---
doc_id: EP-GOV-003
title: 修复 Browser Gate 超时并建立可信浏览器基线
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-19
authority: normative-process
---

# EP-GOV-003：修复 Browser Gate 超时并建立可信浏览器基线

## Purpose

让 GitHub Actions Browser Gate 在受控时间内完成并给出真实、可定位的结果：所需 GLB 与构建产物存在，测试进程不会永久占用 Runner，当前公共仓库的浏览器测试基线通过而不是被超时遮蔽。

## Scope

- 修复 Browser job 缺少 Git LFS 内容、缺少 `dist/` 前置构建和缺少外部超时的问题；
- 修复 `scene-store-settings-into-model-preflight` 中可稳定复现的无限名称探测；
- 对名称探测增加失败关闭的有界保护，避免异常后端让浏览器主线程永久循环；
- 对照现行项目文档语义和实现契约，修复本次远程运行暴露的公共 Browser 测试/夹具漂移；
- 恢复入口包体积门禁，不上调预算、不跳过或静音失败；
- 同步 Harness、验收证据和本计划状态。

## Non-goals

- 不修改 GitHub branch protection、ruleset 或 required checks；OD-005 保持 open；
- 不改变项目/文档状态所有权、GLB/rv-ODT Schema、持久化格式或公开 API；
- 不引入新依赖，不修改 lockfile，不扩大 Git LFS 路径；
- 不修复与本次 Browser Gate 基线无关的产品债务、E2E、真实设备或 rv-embed KD-003；
- 不通过 `continue-on-error`、测试排除、提高断言阈值或延长到数小时来制造绿色结果；
- 不提交、推送或部署。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-CHANGE`、`GOV-DOD`、`GOV-HARNESS`；
- `EP-GOV-002` 的 CI 拆分结果和未运行 Browser 的证据；
- OD-005 保持 open，本计划只修仓库内 Gate，不声明远程分支保护已 enforced；
- plan-716/717 已落地的“默认文档位于项目根目录”行为，以当前代码、测试和计划注释交叉验证，不恢复旧 `scenes/` 默认目录。

## Current Repository Facts

- 开始时分支为 `develop`，HEAD `d815613`，工作区干净并与 `origin/develop` 对齐；
- Quality Gates run `32157736678` 中 Governance、Static、Node、Build 通过，Browser 在 GitHub 的 6 小时上限被取消；
- Browser 测试 16:01:06 开始，最后正常文件于 16:08:59 完成，之后约 5 小时 50 分钟无输出；
- 日志引用 948 个测试文件：930 个完成、17 个明确失败、`scene-store-settings-into-model-preflight.test.ts` 未产生文件级结束记录；
- 单文件本地复现确认：该测试的 fake backend 对所有候选路径都返回 bytes，`newEmpty()` 进入 `planDocument()` 的无界名称探测；
- `actions/checkout@v4` 的 `lfs` 默认是 `false`，远程 Runner 读到三个 GLB 的 LFS pointer；
- `bundle-splitting.test.ts` 明确要求 `dist/`，但独立 Browser job 没有构建且不会继承 Build job 的磁盘产物；
- 本地排除死循环后的失败基线为 9 个文件、14 个测试，包含包体积、项目根目录语义和若干夹具/API 漂移。
- 修订后的远程 run `32205345590` 在 20 分钟 job timeout 被取消：前置构建约 1 分 42 秒、Playwright/Chromium 安装 10 分 08 秒，Browser Harness 仅获得 8 分 22 秒；取消前已有 753/944 个测试文件通过且未出现测试失败。
- 35/20 分层超时后的远程 run `32210852983` 在 9 分 26 秒完成 Browser Harness 调度，942/949 个文件通过；真实失败收敛为 `embed-rehydrate` 清理 Hook 超时，以及一个没有断言失败的 Vitest runner 上下文错误。

## State Ownership and Compatibility

本计划不新增持久化状态。工作流只下载仓库已登记的 LFS 对象并生成当前 job 的临时 `dist/`。文档默认根目录语义保持 plan-716/717 的现行行为；测试按该行为校正，不迁移或重写用户数据。

## Allowed Paths

- `.github/workflows/quality-gates.yml`
- `docs/exec-plans/active/**`
- `docs/exec-plans/completed/**`
- `docs/governance/HARNESS.md`
- `docs/governance/KNOWN_DEVIATIONS.md`
- `docs/acceptance/ACCEPTANCE_MATRIX.md`
- `src/core/project/rv-document-ops.ts`
- `src/hooks/use-mcp-bridge.ts`
- `src/plugins/mcp-bridge-plugin.ts`
- `src/plugins/mcp-bridge/**`
- `src/plugins/layout-planner/**`
- `tests/bundle-splitting.test.ts`
- `tests/embed-rehydrate.test.ts`
- `tests/embed-manager.test.ts`
- `tests/layout-planner-preview-commit.test.ts`
- `tests/mcp-editor-doc-mutations.test.ts`
- `tests/mechanism-mcp-inspect.test.ts`
- `tests/published-examples-glb.test.ts`
- `tests/rv-project-recent.test.ts`
- `tests/rv-scene-published.test.ts`
- `tests/rv-scene-store.test.ts`
- `tests/rv-scene-transient.test.ts`
- `tests/scene-store-settings-into-model-preflight.test.ts`
- `tests/workspace-default-boot.test.ts`
- 新增的窄范围 Browser/Node 回归测试

## Forbidden Paths

- `schema/**`
- `public/**` 和现有 GLB 内容
- `package.json`、`package-lock.json`
- 工业接口、PLC/MQTT/WebSocket 写路径
- E2E、部署脚本、真实设备配置和私有 sibling

## Milestones

1. 黄金切片：单文件死循环变成可结束的通过/明确失败，并为异常后端增加有界反例。
2. CI 输入闭环：Browser job 拉取 LFS、构建 `dist/`、安装 Chromium，并在合理外部超时内运行同一 Harness 入口。
3. 基线闭环：逐项修复 14 个本地失败；不改变 Approved 行为、不提高包体积预算。
4. 全量闭环：focused Browser、完整 Browser、governance、static、node、build 通过，更新远程待验证事实。

## Progress

- [x] 用户批准根因分析与修复范围。
- [x] 建立远程日志和本地单文件复现证据。
- [x] 修复死循环与 CI 输入/超时。
- [x] 修复本地 Browser 失败基线。
- [x] 运行完整本地门禁并同步交付证据。
- [ ] 提交后验证修订的远程 GitHub Actions Browser Gate。

## Surprises & Discoveries

- Browser Gate 的 6 小时不是测试执行时间：测试文件在约 8 分钟内基本跑完，超时遮蔽了既有失败和一个主线程无限循环。
- 独立 job 提升了证据可见性，也使 Build 产物和 LFS 内容不能再依赖另一个 job 或开发机工作区的隐式状态。
- 完整并发 Browser 基线还暴露了两个夹具隔离问题：共享 IndexedDB 的 10 条 recent-project 上限会挤掉本用例句柄；`embed-manager` 的纯管理器断言不应重复进入真实 GLB 加载队列。两者均收窄夹具，没有改变产品上限或隐藏真实上下文恢复测试。
- GitHub-hosted Runner 的 Playwright `--with-deps` 冷安装可能单独消耗约 10 分钟；job 级 20 分钟预算把环境准备时间计入测试保护，导致正常测试在约 80% 进度时被取消。
- `embed-rehydrate` 首个用例只断言仿真 Tick，却默认渲染了 60 帧；`RVEmbedViewer.step()` 已明确记录 SwiftShader 会把渲染工作延迟到 context 销毁阶段，远程 `afterEach → viewer.dispose()` 因而超过 30 秒。同期 `mcp-editor-doc-mutations` 的 23 个断言本地通过，远程错误发生在文件导入阶段，先作为可能的 runner 连带错误观察，不通过改写测试掩盖。

## Decision Log

- 2026-08-19：用户同意修复 CI 输入、死循环、合理超时和剩余 Browser 基线；不采用跳过、放宽或 `continue-on-error`。
- 2026-08-19：保持 plan-716/717 的项目根目录默认文档语义；旧 `scenes/` 期待视为测试漂移，不回退产品行为。
- 2026-08-19：入口包体积继续受 3,520,000 bytes 预算约束；通过恢复懒加载边界解决，不提高阈值。
- 2026-08-19：公共 MCP transform/delete 直接使用公共文档数据，不再依赖私有 UI helper；机构测试通过显式 authoring adapter double 验证编排，不修改公共 inert stub。
- 2026-08-19：本地完整 Browser Gate 已通过，但未经用户授权不提交/推送，因此远程 Gate 证据保持 pending，本计划继续留在 active。
- 2026-08-19：用户同意将 Browser job 总预算调整为 35 分钟，并为 Browser Harness 步骤单独设置 20 分钟上限；环境准备获得独立余量，测试本身仍保持失败关闭且不会无限运行。
- 2026-08-19：用户同意让仿真专用的 60 次 `step()` 显式使用 `render: false`，直接消除无关 GPU 清理负担；不提高 Hook timeout，不修改本地已通过的 MCP 测试。

## Validation

- `./scripts/verify.sh governance`
- `./scripts/verify.sh static`
- `./scripts/verify.sh node`
- `./scripts/verify.sh browser`
- `./scripts/verify.sh build`
- `npm test -- tests/embed-rehydrate.test.ts tests/mcp-editor-doc-mutations.test.ts`
- 死循环、名称探测上限、LFS pointer 和缺失 `dist/` 的 focused 正反例
- GitHub Actions 远程 Browser Gate（需要后续提交/推送，本任务不执行）

## Rollback

工作流可回退到原 Browser job；名称探测保护和测试夹具可按同一变更回退；懒加载边界可恢复原导入。没有 Schema、项目数据或外部状态迁移需要回滚。回退后远程 6 小时挂起风险和 LFS/`dist` 缺口会重新出现。

## Outcomes & Retrospective

- 工作流现在显式执行 LFS checkout、公共 build、Chromium 安装和 Browser Harness；job 以 35 分钟总上限失败关闭，Browser Harness 另有 20 分钟步骤上限。
- `planDocument()` 最多探测 1,000 个候选名；异常后端获得明确错误，原挂起文件和新增反例均在毫秒级结束。
- plan-716/717 后仍期待 `scenes/` 默认目录的测试已对齐项目根目录契约；发布示例测试改为验证 first-class project document。
- MCP bridge 默认端口移入无依赖模块，生产入口为 3,287,254 bytes，低于未改变的 3,520,000 bytes 预算；bridge 保持独立 lazy chunk。
- 验证：governance 通过（34 governed documents）；static 通过；Node 50 files 通过、2 skipped（460 tests 通过、7 skipped）；Build 通过；focused Browser 11 files / 130 tests 通过；最终完整 Browser 944 files 通过、5 skipped（10,366 tests 通过、12 skipped、2 todo），耗时 123.57 秒。
- 远程 run `32205345590` 已证明 LFS、build、Chromium 安装和 Browser Harness 能进入执行，但 20 分钟 job 总预算不足；run `32210852983` 证明 35/20 分层预算足以让完整 Browser Harness 在受控时间内结束并报告真实失败。
- 本次 render-free 修订后，governance、ESLint、TypeScript 和独立 `mcp-editor-doc-mutations` 23/23 通过；本机 Playwright Chromium 145 在进入 `embed-rehydrate` 修改行前即无法创建 WebGL context，因此该文件和完整 Browser Gate 不能由本机结果替代 Linux Actions 验证。
- 未验证：仿真 Tick 改为 render-free 后的 GitHub Actions run、MCP runner 上下文错误是否随 GPU 阻塞消失、branch protection/ruleset、E2E、真实设备/PLC、人工 UX；这些不由本次本地门禁替代。
- 回滚仍为同一变更集反向回退，无 Schema、项目数据或外部状态迁移；回滚会重新引入 6 小时挂起和 CI 输入缺口。

修订后的远程 Browser Gate 通过前，本计划不得移入 `completed/`。
