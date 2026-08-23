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
- `playwright.config.ts`
- `e2e/`
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

2026-08-23 已按用户指令完成，实际生效配置（API 复核）：

```
required_checks : Governance Gate, Static Gate, Node Gate, Browser Gate, Build Gate
strict          : true    合入前分支须为最新
enforce_admins  : true    管理员不可绕过
force_push      : false
deletion        : false
reviews_required: false   单人仓库无法自审，要求 review 会使 main 不可合入
```

同日按维护者追加指令，`develop` 配置了完全相同的策略（API 复核：两分支均 checks=5 / strict / enforce_admins / 禁强推 / 不要求 review）。

`quality-gates.yml` 的触发器是 `pull_request` 与 `push: [main, develop]`，因此 PR 上五项检查都会上报，不存在"要求了但永不上报"的死锁。

**工作方式变更**：两个分支都不再接受直接 push。这正是本计划要达到的状态——CI 红色无法再被绕过。

### M3 — "断言从未执行"的守卫

对重型/端到端用例补充反退化断言（如参考负载的 `totalEventsProcessed > MU 数`），并排查现有套件中同类失效。

已完成部分：`tests/e2e-suite-runnable.node.test.ts` 守住"spec 无法被收集"这一类；e2e 全局浏览器修复见下。

验证：`npx vitest run --config vitest.node.config.ts tests/e2e-suite-runnable.node.test.ts`

## Progress

- [x] M1 本机门禁 = CI
- [x] M2 OD-005 分支保护（`main` 与 `develop` 均已配置）
- [~] M3 反退化守卫（e2e 可收集性已守卫；新暴露的 e2e 基线待处理）

## Surprises & Discoveries

- 根因不是 SwiftShader 本身，而是 **Playwright 默认的 `chromium-headless-shell` 没有 GPU 栈**。Linux 上这一点不可见（ANGLE 回落到可用的软件光栅），macOS 上回落到 SwiftShader-on-Vulkan 并以 `BindToCurrentSequence failed` 失败。此前所有 ExecPlan 把它记为"SwiftShader 上下文耗尽"，方向是错的——单跑同样失败，与并发无关。此处更正该归因；历史计划中的记录保持原样，它们描述的是当时观测到的现象。
- `@vitest/browser-playwright` 的启动选项属于 `playwright()` **provider**，不是 `instances[]` 的条目。把 `launch` 或 `launchOptions` 写在 instance 上**类型检查通过、静默无效**——本计划前两次尝试正是因此失败。这本身就是本计划要防的失效类别（配置看起来对，实际什么都没做）。

## M3 中间结果（2026-08-23）

同一失效类别在 e2e 侧一共找到三个实例，前两个已修：

1. **29 个 spec 中 24 个没有 GL 启动参数**，headless Chromium 拿不到 canvas，断言全程不执行。`smoke.spec.ts` 4 失败/1 通过 → **5 通过**。修法是把 `channel: 'chromium'` 放进 `playwright.config.ts` 的两个 project，而不是继续往每个 spec 里抄参数；同时撤掉 EP-DES-002 期间给 `smart-asset-editor.spec.ts` 加的那段 workaround（它当时是权宜之计，现在根因已修）。仍保留自带软件渲染参数的 4 个 spec——其中 2 个有像素/渲染断言，那是**刻意的确定性选择**，不是同一回事，已在配置注释里写明不要照抄。
2. **`camera-startpos.spec.ts` 导入 `@playwright/test`**（本仓依赖的是 `playwright/test`，该包未安装）。Playwright 在**收集阶段**就失败，因此这一行让整个 `npx playwright test` 无法启动——这正是历来所有计划都只跑"聚焦 spec"、从未跑过全量套件的原因。已改为 `playwright/test`，并由 `tests/e2e-suite-runnable.node.test.ts` 守住。
3. **e2e 没有私有依赖排除机制**（未修，见下）。

### 新暴露的 e2e 基线

套件首次可整体收集后，真实状态为 **104 例中 63 通过 / 24 失败 / 6 跳过 / 11 未运行**。此前无人见过这个数字。

24 个失败中 **11 个已归因**：`editor-continuity`（8）、`mechanism-force-analysis`、`mechanism-authoring-matrix`、`mechanism-force-benchmark` 都 `import('/src/plugins/asset-editor/...')`——该目录**在公开 checkout 中不存在**，只存在于私有 sibling。单元测试有 `tests/private-dependent-tests.json` 这一生成的排除机制，**e2e 从来没有**，所以公开 checkout 永远跑不绿这套。

这需要一个设计决定（这些 spec 应迁入私有仓，还是为 e2e 建同类生成排除列表），不在本里程碑内自行拍板。剩余 13 个失败尚未归因。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-23 | 优先做 P0（门禁可信）而非新功能 | 用户当前明确指令"从 P0 开始" | 四个功能带着从未执行的测试交付，且 CI 红着仍被推入——先修验证系统 |
| 2026-08-23 | 浏览器切换无条件生效，不做按平台分支 | 本计划目标即"本机 = CI" | 两端跑不同浏览器就等于没解决问题；`playwright install chromium` 已同时安装两个二进制 |
| 2026-08-23 | 不新增 gzip 传输预算断言 | 用户当前明确指令"3 不动" | 属产品决策，不在本计划范围 |
| 2026-08-23 | 保护 `main`，五项检查全选，管理员不可绕过 | 用户当前明确指令 | 已配置并复核 |
| 2026-08-23 | 追加保护 `develop`，配置与 `main` 一致 | 用户当前明确指令，在被告知"仅保护 main 不阻止触发证据重演"之后 | 两个分支自此都不接受直接 push；所有改动走特性分支 + PR，等五项 Gate 全绿。这是本计划目标的实际达成点 |
| 2026-08-23 | 分支保护不要求 PR review | 单人仓库无法自审 | 要求 review 会使 `main` 完全不可合入；required checks 与 review 是两件事，前者已全选 |

## Validation

M1/M3（2026-08-23，本机 Darwin 25.6 / Apple M5）：

- `npm test -- --exclude tests/drop-target-overlay.test.ts`：**1,031 文件中 1,028 通过、3 跳过；10,869 例中 10,860 通过、7 跳过、2 todo、零失败**。改动前为 22 文件 / 82 例失败。
- `npm test -- tests/drop-target-overlay.test.ts`（隔离性能套件）：11/11 通过。
- `tsc -p tsconfig.json --noEmit` 通过。
- **CI 已确认**：run [`32616661537`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32616661537) 五个 Gate 全绿，Browser Gate 9 分 20 秒（切换前为 11 分 20 秒）。此前登记的"CI 侧未验证"风险已解除。
- M3：`tests/e2e-suite-runnable.node.test.ts` 3/3 通过；`npx playwright test --list` 首次可收集全部 104 例 / 29 文件。
- 未验证：新暴露的 24 个 e2e 失败中有 13 个尚未归因；e2e 私有依赖排除机制未建。**不声称 e2e 套件通过。**

## Rollback

M1 是 `vite.config.ts` 中 `test.browser.provider` 一行的改动，`git revert` 即可回到 headless shell；不影响 `dist/`、运行时或任何产物。

## Outcomes & Retrospective

M1 完成。M3 部分完成：e2e 可收集性与全局浏览器已修并加守卫，新暴露的 e2e 基线（24 失败中 13 未归因）与私有依赖排除机制待后续。M2 未开始，待用户决定分支保护策略。
