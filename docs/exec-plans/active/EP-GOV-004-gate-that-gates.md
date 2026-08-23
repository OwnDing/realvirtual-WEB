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
- 修复大规模 Browser Mode 套件的 CI 基础设施抖动，同时保持 Browser Gate required、全量和失败关闭。

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
- 文档 PR #1（commit `d24936d`）只改 3 个治理文档，Browser Gate run `32625669475` 的两次 attempt 都在 `tests/commissioning-trust-activation.test.ts` 导入阶段失败：一次是 dynamic module fetch，一次是 Vitest runner 无法找到；两次均已有 **1,025 文件 / 10,822 例通过**，没有断言失败。包含同一文档提交的 PR #2（commit `53642db`）随后在 run `32625805452` 中五项 Gate 全绿，同一文件 33/33、全量 1,031 文件 / 10,869 例通过。证据指向 Browser runner/Chromium 生命周期，而不是文档或该测试的确定性回归。
- 当前锁定 Vitest / `@vitest/browser-playwright` `4.0.18`。上游 [`vitest-dev/vitest#9437`](https://github.com/vitest-dev/vitest/issues/9437) 记录了 Ubuntu 24.04 + Chromium 在大型 Browser Mode 套件中保留已删除临时文件、最终以动态导入/iframe 错误失败的同形态问题；修复 [`#10912`](https://github.com/vitest-dev/vitest/pull/10912) 只进入 Vitest 5 RC。当前计划不把 required gate 押在 RC 升级或本地复刻上游补丁上。

## State Ownership and Compatibility

浏览器选择是测试基础设施配置，不进入任何产物、不影响 `dist/`、不改变运行时行为。`playwright install chromium` 同时安装 Chrome for Testing 与 headless shell，CI 无需新增步骤。

## Allowed Paths

- `vite.config.ts`（仅 `test.browser` 段）
- `playwright.config.ts`
- `e2e/`
- `.github/workflows/`
- `scripts/verify.sh`
- `scripts/run-browser-gate.{mjs,d.mts}`
- `docs/`
- `tests/`
- `scripts/gen-private-test-excludes.{mjs,d.mts}`

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

### M4 — 大型 Browser Gate 稳定性

保持全部 Browser 测试与现有 20 分钟 test timeout，把主套件确定性拆为 `1/4` 至 `4/4` 四个互补 shard，顺序运行且每个 shard 使用新的 npm / Vitest / Chromium 进程；原有 wall-clock 性能套件继续在第五个独立进程运行。每个阶段采样临时盘和主机可用内存并输出最低值，以便远程失败能够区分断言回归与 runner 资源耗尽。

失败语义不变：任一 shard 或性能套件非零即整项 Browser Gate 非零；不使用 retry、`continue-on-error`、`passWithNoTests`、changed/related 子集，也不从分支保护 required checks 中移除 Browser Gate。

本地验收：门禁 runner 结构自检通过；至少两轮完整 `./scripts/verify.sh browser` 通过。远程验收：同一提交至少 3 次 fresh Browser Gate 全绿并保留诊断日志；已在 PR #3 获授权后执行。

## Progress

- [x] M1 本机门禁 = CI
- [x] M2 OD-005 分支保护（`main` 与 `develop` 均已配置）
- [~] M3 反退化守卫（可收集性、GPU、私有依赖排除三项已修并加守卫；剩余 13 个 e2e 失败未归因）
- [x] M4 Browser Gate 稳定性（四分片本地全量通过；同一实现提交远程 3/3 fresh-run 五项全绿）

## Surprises & Discoveries

- 根因不是 SwiftShader 本身，而是 **Playwright 默认的 `chromium-headless-shell` 没有 GPU 栈**。Linux 上这一点不可见（ANGLE 回落到可用的软件光栅），macOS 上回落到 SwiftShader-on-Vulkan 并以 `BindToCurrentSequence failed` 失败。此前所有 ExecPlan 把它记为"SwiftShader 上下文耗尽"，方向是错的——单跑同样失败，与并发无关。此处更正该归因；历史计划中的记录保持原样，它们描述的是当时观测到的现象。
- `@vitest/browser-playwright` 的启动选项属于 `playwright()` **provider**，不是 `instances[]` 的条目。把 `launch` 或 `launchOptions` 写在 instance 上**类型检查通过、静默无效**——本计划前两次尝试正是因此失败。这本身就是本计划要防的失效类别（配置看起来对，实际什么都没做）。
- PR #1 的两次失败虽然落在同一测试文件，但错误文本不同、都发生在 import/runner 层；PR #2 对同一提交内容的同一文件 33/33 通过。按文件名追业务断言无法解释这组证据。
- Vitest 4 的同形态上游问题与当前失败都发生在大套件接近结束时。通过测试级 retry 只会继续使用受污染的 Chromium 生命周期；进程边界才能释放被 Chromium 持有的资源。

## M3 中间结果（2026-08-23）

同一失效类别在 e2e 侧一共找到三个实例，前两个已修：

1. **29 个 spec 中 24 个没有 GL 启动参数**，headless Chromium 拿不到 canvas，断言全程不执行。`smoke.spec.ts` 4 失败/1 通过 → **5 通过**。修法是把 `channel: 'chromium'` 放进 `playwright.config.ts` 的两个 project，而不是继续往每个 spec 里抄参数；同时撤掉 EP-DES-002 期间给 `smart-asset-editor.spec.ts` 加的那段 workaround（它当时是权宜之计，现在根因已修）。仍保留自带软件渲染参数的 4 个 spec——其中 2 个有像素/渲染断言，那是**刻意的确定性选择**，不是同一回事，已在配置注释里写明不要照抄。
2. **`camera-startpos.spec.ts` 导入 `@playwright/test`**（本仓依赖的是 `playwright/test`，该包未安装）。Playwright 在**收集阶段**就失败，因此这一行让整个 `npx playwright test` 无法启动——这正是历来所有计划都只跑"聚焦 spec"、从未跑过全量套件的原因。已改为 `playwright/test`，并由 `tests/e2e-suite-runnable.node.test.ts` 守住。
3. **e2e 没有私有依赖排除机制** —— 已修，见下。

### 新暴露的 e2e 基线

套件首次可整体收集后，真实状态为 **104 例中 63 通过 / 24 失败 / 6 跳过 / 11 未运行**。此前无人见过这个数字。

24 个失败中 **11 个已归因**：`editor-continuity`（8）、`mechanism-force-analysis`、`mechanism-authoring-matrix`、`mechanism-force-benchmark` 都 `import('/src/plugins/asset-editor/...')`——该目录**在公开 checkout 中不存在**，只存在于私有 sibling。单元测试有 `tests/private-dependent-tests.json` 这一生成的排除机制，**e2e 从来没有**，所以公开 checkout 永远跑不绿这套。

维护者于 2026-08-23 选择方案 A：为 e2e 建同类生成排除列表。已实现：

- `scripts/gen-private-test-excludes.mjs` 扩展出 `computePrivateDependentSpecs()`，输出 `e2e/private-dependent-specs.json`；
- 判据与单元测试**不同且必须不同**：spec 自己不导入私有模块，是**浏览器**通过 dev server 去 `import('/src/plugins/asset-editor/…')`，所以 `isPrivateSpecifier` 看不见它。改用"这个页面内 `/src/…` 路径在本 checkout 里是否存在"——文件不在就永远加载不了，无论是私有、被移动还是单纯拼错。这一判据顺带覆盖了本计划针对的整个失效类别；
- `playwright.config.ts` 在**私有 sibling 缺失时**才应用该排除，完整 checkout 仍跑全部 spec；
- `tests/private-test-excludes.node.test.ts` 扩展了漂移守卫。

实现过程中撞上第四个同类实例，值得记下来：`scripts/gen-private-test-excludes.d.mts` 是**手写声明文件**，`allowJs` 关闭时 TypeScript 只读它、完全不看同名 `.mjs`。新增的 `computePrivateDependentSpecs` 因此编译报"has no exported member"，而反向错误更糟——声明了一个已被删除的函数，处处类型检查通过、运行时才炸。已补声明并加 `describe('generator declaration parity')` 守住两者一致（现 7/7 通过）。

生成结果 4 个 spec：`editor-continuity`、`mechanism-authoring-matrix`、`mechanism-force-analysis`、`mechanism-force-benchmark`。

### 方案 A 后的 e2e 基线

**82 例：63 通过 / 13 失败 / 6 跳过 / 0 未运行**（此前 104 例：63 通过 / 24 失败 / 6 跳过 / 11 未运行）。通过数不变，11 个私有依赖失败与全部"未运行"消失。

剩余 13 个失败按 spec 分布，**尚未逐条归因**：`connect-embed-e2e`（5）、`hmi-panels`（2）、`camera-startpos`（2）、`slot-authority`、`sink-test`、`signal-link-mode`、`embed-smoke` 各 1。错误形态以 `locator.click` 超时（5）、`element(s) not found`（4）、可见性/文本断言（6）为主，另有 1 个 `net::ERR_HTTP_RESPONSE_CODE_FAILURE` 与 1 个 `ECONNRESET`——后两个指向 embed preview server，不是页面断言。

`camera-startpos` 的 2 个失败是**新增可见的**：该 spec 此前因导入 `@playwright/test` 从未运行过，修好收集后才第一次执行并失败。

**不声称 e2e 套件通过。**

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-23 | 优先做 P0（门禁可信）而非新功能 | 用户当前明确指令"从 P0 开始" | 四个功能带着从未执行的测试交付，且 CI 红着仍被推入——先修验证系统 |
| 2026-08-23 | 浏览器切换无条件生效，不做按平台分支 | 本计划目标即"本机 = CI" | 两端跑不同浏览器就等于没解决问题；`playwright install chromium` 已同时安装两个二进制 |
| 2026-08-23 | 不新增 gzip 传输预算断言 | 用户当前明确指令"3 不动" | 属产品决策，不在本计划范围 |
| 2026-08-23 | 保护 `main`，五项检查全选，管理员不可绕过 | 用户当前明确指令 | 已配置并复核 |
| 2026-08-23 | e2e 私有依赖采用方案 A（生成排除列表），不迁仓、不让 spec 自行 skip | 用户当前明确指令"同意 A" | 与单元测试同一套已验证机制；自行 skip 会把"没跑"伪装成"通过"，正是本计划要消灭的那类 |
| 2026-08-23 | 追加保护 `develop`，配置与 `main` 一致 | 用户当前明确指令，在被告知"仅保护 main 不阻止触发证据重演"之后 | 两个分支自此都不接受直接 push；所有改动走特性分支 + PR，等五项 Gate 全绿。这是本计划目标的实际达成点 |
| 2026-08-23 | 分支保护不要求 PR review | 单人仓库无法自审 | 要求 review 会使 `main` 完全不可合入；required checks 与 review 是两件事，前者已全选 |
| 2026-08-23 | 选择方案 A，专项修复 Browser Gate，不临时移除 required，也不靠重跑碰绿 | 用户当前明确指令“按照A来，帮我全部完成” | required 语义保持不变；修复、结构自检、资源证据和重复验证属于本计划 M4 |
| 2026-08-23 | Vitest 4 主套件采用四个顺序、独立进程的确定性 shard | 上游根因证据 + 当前 PR 对照证据 + PR #3 attempt 2 | 初版两个 shard 本地两轮和远程 attempt 1 通过，但 attempt 2 在第一个 shard 已通过 512 文件 / 5,428 例后复现同一 import flake；四分片把单进程上限降至约 258 文件。无重试、无跳过，四个 shard 并集仍覆盖完整主套件 |

## Validation

M1/M3（2026-08-23，本机 Darwin 25.6 / Apple M5）：

- `npm test -- --exclude tests/drop-target-overlay.test.ts`：**1,031 文件中 1,028 通过、3 跳过；10,869 例中 10,860 通过、7 跳过、2 todo、零失败**。改动前为 22 文件 / 82 例失败。
- `npm test -- tests/drop-target-overlay.test.ts`（隔离性能套件）：11/11 通过。
- `tsc -p tsconfig.json --noEmit` 通过。
- **CI 已确认**：run [`32616661537`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32616661537) 五个 Gate 全绿，Browser Gate 9 分 20 秒（切换前为 11 分 20 秒）。此前登记的"CI 侧未验证"风险已解除。
- M3：`tests/e2e-suite-runnable.node.test.ts` 3/3 通过；`npx playwright test --list` 首次可收集全部 104 例 / 29 文件。
- M3 方案 A：`tests/private-test-excludes.node.test.ts` 6/6；e2e 收集 82 例 / 25 文件；全量 63 通过 / 13 失败 / 6 跳过 / 0 未运行。
- 未验证：剩余 13 个 e2e 失败尚未逐条归因。**不声称 e2e 套件通过。**

M4（2026-08-23，本机 Darwin 25.6 / Apple M5）：

- `npx vitest run --config vitest.node.config.ts tests/browser-gate-runner.node.test.ts`：**4/4**；守住四个互补 shard、隔离性能套件、无 retry/子集/false-green、workflow 仍从 `Browser Gate` 调用失败关闭入口，以及 `.mjs`/`.d.mts` 导出一致。
- 初版两分片的两轮完整本地 `./scripts/verify.sh browser` 均退出 0；PR #3 run `32628728580` attempt 1 五项全绿，Browser 10 分 35 秒。attempt 2 在第一个 shard 已通过 **512 文件 / 5,428 例**后，`commissioning-trust-activation.test.ts` 再次 dynamic import 失败，零断言失败；临时盘最低 77.68 GiB、内存最低 9.22 GiB。该证据否决两分片并推动四分片实现，不把 attempt 1 的绿色当完成。
- 四分片调整后，`CI=1 ./scripts/verify.sh browser` 本地全量退出 0；四个主 shard 和隔离性能进程全部通过，单 shard 最大约 258 文件，性能套件 11/11。
- `./scripts/verify.sh governance`、`static`、`node`、`build` 均通过；Node 为 **61 文件 / 633 例通过**（另 2 文件 / 7 例按既有条件 skip）。
- **远程验收完成**：PR #3、实现提交 `bffbaf9` 的 run [`32629737449`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32629737449) attempts 1/2/3 五项 Gate 全绿；Browser 分别 **10:02 / 12:06 / 9:07**。每轮四个主 shard 都是 258 / 258 / 258 / 257 文件，性能套件独立 1 文件；三轮资源最低值为临时盘 78.57 GiB、内存 9.00 GiB，每个 shard 结束后临时盘恢复到约 83.75 GiB。

## Rollback

M1 是 `vite.config.ts` 中 `test.browser.provider` 一行的改动。M4 回滚时恢复 `scripts/verify.sh` 原 browser 段、删除 `scripts/run-browser-gate.mjs` 与对应 Node 守卫、移除 workflow 诊断环境变量即可；两者都不影响 `dist/`、运行时或产品契约。

## Outcomes & Retrospective

M1、M2、M4 已完成。M3 部分完成：e2e 可收集性与全局浏览器已修并加守卫，剩余 13 个 e2e 失败未归因。M4 的初版两分片被远程重复验证否决，四分片在同一实现提交上完成远程 3/3 fresh-run；Browser required、全量与失败关闭语义均保持不变。
