---
doc_id: EP-GOV-004
title: 让质量门禁真正拦得住东西
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-23
authority: normative
---

# EP-GOV-004：让质量门禁真正拦得住东西

## Purpose

当前门禁不能证明产品可用。本计划让它可以：本机门禁结果与 CI 一致、CI 结果能阻止合入、以及重型用例不能在"看起来绿"的同时什么都没执行。

完成后维护者能够：在本机跑一次浏览器门禁并相信它的结论；在 CI 红的时候无法把改动推进受保护分支；以及在评审时区分"断言通过"和"断言根本没运行"。

本计划于 2026-08-23 依据用户当前明确指令（"从 P0 开始"）建立并直接激活。

## Scope

- 本机浏览器门禁与 CI 使用同一浏览器与同一结论；
- OD-005 的落地：required checks 与分支保护策略；
- 针对"断言从未执行"这一失效类别的守卫模式与既有用例排查。

## Non-goals

- 不改产品功能、Schema、持久化格式或任何运行时行为；
- 不新增门禁维度（gzip 传输预算等属于产品决策，已由用户在 2026-08-23 明确排除）；
- 不重写历史 ExecPlan 中当时为真的偏差记录。

## Required Documents and Decisions

- [`GOV-HARNESS`](../../governance/HARNESS.md)、[`DEFINITION_OF_DONE`](../../governance/DEFINITION_OF_DONE.md)、[`AI_SAFETY`](../../governance/AI_SAFETY.md)；
- [`OPEN_DECISIONS`](../../governance/OPEN_DECISIONS.md)：本计划直接推进 **OD-005**（CI configured → enforced）；
- [`EP-GOV-003`](../completed/EP-GOV-003-browser-gate-baseline.md)：上一次浏览器门禁基线工作。

## Current Repository Facts

开始时分支 `develop`，HEAD 为 `6cc496a`，工作树 clean。实测：

- 本机 `npm test`：1,031 文件中 **22 失败**、10,869 例中 **82 失败**。CI 用**完全相同的命令**（`./scripts/verify.sh browser`，无任何 GPU 参数）在 ubuntu-24.04 上跑出 1,025/1,031、**测试零失败**。
- 22 个失败文件全部报 `THREE.WebGLRenderer: Error creating WebGL context`，单跑同样失败——不是并发导致的上下文耗尽。
- 直接对 Playwright 探测本机（Darwin 25.6 / Apple M5）各 headless 形态：

  | 形态 | WebGL |
  | --- | --- |
  | `chromium-headless-shell`（Playwright 默认，vitest 当前使用） | **NO CONTEXT** |
  | `channel: 'chromium'`（Chrome for Testing，新 headless） | OK — ANGLE Metal Renderer |
  | headless + `--enable-unsafe-swiftshader` | OK（SwiftShader） |
  | headed | OK — ANGLE Metal Renderer |

- CI 历史：`f012911` 与 `2c42c21` 的 Browser Gate 因 `tests/des-workspace-coupling.test.ts` 连续两次红，两个提交仍被推入 `develop`——`main`/`develop` 无 branch protection、无 required checks（OD-005）。
- 最近四个功能提交中有四处"测试从未执行"：参考负载只处理 1 个事件、编辑器 E2E 缺 GL 参数卡在等 canvas、耦合测试的假 viewer 抛错、事件队列 overlay 从未注册。四处均已由 [`EP-DES-002`](../completed/EP-DES-002-public-des-hardening.md) 修复，但失效**类别**没有守卫。

## State Ownership and Compatibility

浏览器选择是测试基础设施配置，不进入任何产物、不影响 `dist/`、不改变运行时行为。`playwright install chromium` 同时安装 Chrome for Testing 与 headless shell，CI 无需新增步骤。

## Allowed Paths

- `vite.config.ts`（仅 `test.browser` 段）
- `.github/workflows/`
- `scripts/verify.sh`
- `docs/`
- `tests/`

## Forbidden Paths

- `src/`
- `schema/`
- `public/`

## Milestones

### M1 — 本机门禁 = CI

`test.browser` 改用 Chrome for Testing（新 headless），使本机与 CI 跑同一浏览器。

正例：本机全量 Browser 零失败。反例：不得用跳过或排除达成。

验证：`npm test -- --exclude tests/drop-target-overlay.test.ts`、`npm test -- tests/drop-target-overlay.test.ts`

### M2 — OD-005：让 CI 结果能阻止合入

确定 required checks 名称集合与分支保护策略，配置到 `main`/`develop`，并把 OD-005 从 open 改为 closed。

**本里程碑需要仓库管理员操作，属用户决策，Agent 不得自行配置。**

### M3 — "断言从未执行"的守卫

对重型/端到端用例补充反退化断言（如参考负载的 `totalEventsProcessed > MU 数`），并排查现有套件中同类失效。

## Progress

- [x] M1 本机门禁 = CI
- [ ] M2 OD-005 分支保护（待用户决策与管理员操作）
- [ ] M3 反退化守卫

## Surprises & Discoveries

- 根因不是 SwiftShader 本身，而是 **Playwright 默认的 `chromium-headless-shell` 没有 GPU 栈**。Linux 上这一点不可见（ANGLE 回落到可用的软件光栅），macOS 上回落到 SwiftShader-on-Vulkan 并以 `BindToCurrentSequence failed` 失败。此前所有 ExecPlan 把它记为"SwiftShader 上下文耗尽"，方向是错的——单跑同样失败，与并发无关。此处更正该归因；历史计划中的记录保持原样，它们描述的是当时观测到的现象。
- `@vitest/browser-playwright` 的启动选项属于 `playwright()` **provider**，不是 `instances[]` 的条目。把 `launch` 或 `launchOptions` 写在 instance 上**类型检查通过、静默无效**——本计划前两次尝试正是因此失败。这本身就是本计划要防的失效类别（配置看起来对，实际什么都没做）。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-23 | 优先做 P0（门禁可信）而非新功能 | 用户当前明确指令"从 P0 开始" | 四个功能带着从未执行的测试交付，且 CI 红着仍被推入——先修验证系统 |
| 2026-08-23 | 浏览器切换无条件生效，不做按平台分支 | 本计划目标即"本机 = CI" | 两端跑不同浏览器就等于没解决问题；`playwright install chromium` 已同时安装两个二进制 |
| 2026-08-23 | 不新增 gzip 传输预算断言 | 用户当前明确指令"3 不动" | 属产品决策，不在本计划范围 |

## Validation

M1（2026-08-23，本机 Darwin 25.6 / Apple M5）：

- `npm test -- --exclude tests/drop-target-overlay.test.ts`：**1,031 文件中 1,028 通过、3 跳过；10,869 例中 10,860 通过、7 跳过、2 todo、零失败**。改动前为 22 文件 / 82 例失败。
- `npm test -- tests/drop-target-overlay.test.ts`（隔离性能套件）：11/11 通过。
- `tsc -p tsconfig.json --noEmit` 通过。
- 未验证：本改动在 CI（ubuntu-24.04）上的表现。CI 当前用默认 headless shell 且通过；切换后需由下一次 push 的 Browser Gate 确认。若 Chrome for Testing 在 CI 缺失，失败是启动期立即可见的，不是静默降级。

## Rollback

M1 是 `vite.config.ts` 中 `test.browser.provider` 一行的改动，`git revert` 即可回到 headless shell；不影响 `dist/`、运行时或任何产物。

## Outcomes & Retrospective

M1 完成后待补；M2/M3 未开始。
