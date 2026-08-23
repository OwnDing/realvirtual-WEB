---
doc_id: EP-DES-002
title: 公开 DES 与稳定端口的正确性、生命周期与热点加固
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-23
authority: normative
---

# EP-DES-002：公开 DES 与稳定端口的正确性、生命周期与热点加固

## Purpose

在不改变 [`CONTRACT-DES-RUNTIME-001`](../../contracts/DES_RUNTIME.md) 与 [`CONTRACT-ASSEMBLY-PORTS-001`](../../contracts/ASSEMBLY_PORTS.md) 对外语义的前提下，修复 [`EP-DES-001`](../completed/EP-DES-001-public-domain-neutral-des.md) 与 [`EP-PLANNER-001`](../completed/EP-PLANNER-001-paintline-assembly-mvp.md) 交付后复审发现的四类 P0 缺陷和一组 P1 热点，并把当前红色的 DES 特征测试恢复为真实通过。

完成后用户能够：在新会话里加载历史 checkpoint 而不损坏运行时；在带 uniform scale 的资产上得到正确的端口对齐；连续加载多个模型而不泄漏 DES 运行时；在万级挂起事件下保持可用帧率。

本计划于 2026-08-23 依据用户当前明确指令（同意复审结论并要求完成优化）建立并直接激活。

## Scope

- 快照恢复的动作预注册与两阶段原子提交，以及 UI 侧失败可见性；
- 命名动作表去实例捕获，`SimulationKernel` 在模型切换时的显式释放；
- `AssemblyPort` 显式 `Direction` 在带缩放父链下的世界旋转取值修正；
- `demo-robot-loading` 参考模型改为真正消耗仿真时间，并修复其红色特征测试；
- 事件队列取消索引、模型事件时间 O(log n) 取值，以及若干 O(n²)/大对象克隆热点；
- 分布钳位、组件 RNG 重播种、`restore()` 遗漏状态位等数值与状态细节；
- 智能资产编辑器的 XML 转义与端口节点重名去重；
- private-stub 与实际装配的一致性收敛；
- 覆盖上述行为的回归测试与操作计数基线。

## Non-goals

- 不改变 rv-ODT Schema、`DES_RUNTIME` 快照版本号或已保存快照的字段布局；
- 不改变 Snap 名称约定与既有 `Snap-*` 兼容路径的语义；
- 不重构 DES 组件模型、MaterialFlow 定义或工作区 UI 结构；
- 不提高入口包预算，不引入新依赖；
- 不删除、跳过或放宽任何既有测试。

## Required Documents and Decisions

- [`DEVELOPMENT_CONSTITUTION`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`AI_SAFETY`](../../governance/AI_SAFETY.md)、[`DEFINITION_OF_DONE`](../../governance/DEFINITION_OF_DONE.md)；
- [`PS-DES-001`](../../product-specs/PUBLIC_DES.md)、[`CONTRACT-DES-RUNTIME-001`](../../contracts/DES_RUNTIME.md)；
- [`ADR-0003`](../../adr/ADR-0003-stable-assembly-ports.md)、[`ADR-0005`](../../adr/ADR-0005-public-domain-neutral-des.md)；
- [`OPEN_DECISIONS`](../../governance/OPEN_DECISIONS.md)：本计划不触及任何 open 闸口。

## Current Repository Facts

开始时工作树 clean，分支 `develop`，HEAD 为 `f012911`。实测基线：

- `tsc -p tsconfig.json --noEmit` 通过；`npm run lint` 通过；`npm run test:node` 59 文件 / 622 例通过。
- `npx vitest run tests/des/` 为 68 文件 / 366 例，**1 例失败**：`tests/des/des-robot-loading-e2e.test.ts:141`。
- `EP-DES-001` 的 Validation 记录为“68 个文件、365 例全部通过”，与上一条不符（该行只统计了通过数）。
- 探针实测 `demo-robot-loading` 参考负载：`totalEventsProcessed = 1`，`pendingBefore = 1`，`runMs ≈ 0.2`；2000 件产出全部在 `runner.start()` 内同步完成。
- 探针实测 `DESManager.restore()` 遇未注册动作：抛 `unknown action: PaintStation.Finish`，抛出后 `currentTime=1234 / processed=42 / seed=7 / pending=0`（半恢复）。
- 探针实测每帧 `maybeCompleteRun()`：1k/10k/50k 挂起事件分别 0.06 / 0.48 / 2.44 ms；`cancelEvent` 在 10k 挂起时单次 0.32 ms。
- 探针实测 `Quaternion.setFromRotationMatrix(matrixWorld)` 在 owner uniform scale 0.001 时把 45° 旋转读成 ~0°。

## State Ownership and Compatibility

- 命名动作表继续由 `rv-des-named-actions.ts` 模块级持有，但 handler 不再捕获 runner 实例；运行期归属通过 `ActionContext.manager` 解析，快照仍只存动作名。
- 事件队列新增的取消索引是纯运行期结构，不进入快照。
- `restore()` 改为先解析后提交，快照字段、版本号与迁移路径不变；旧快照继续按 v1/v2/v3 迁移。
- `AssemblyPort` 元数据格式不变，只修正读取时的世界旋转取值。
- 端口节点重名去重只影响**新建**节点的默认命名，不改写已有资产。

## Allowed Paths

- `src/core/material-flow/des/`
- `src/plugins/des/`
- `src/plugins/snap-point/assembly-port.ts`
- `src/plugins/sim-controller/DESExperimentMatrixPanel.tsx`
- `src/plugins/smart-asset-editor/smart-asset-model.ts`
- `src/core/rv-viewer.ts`
- `src/private-stubs/`
- `tests/des/`, `tests/`
- `docs/`

## Forbidden Paths

- `schema/`
- `public/library/`
- `src/core/engine/rv-snap-point-registry.ts`
- 任何生成物与锁文件

## Milestones

### M1 — 快照恢复的原子性与可见性

`start()` 按定义预注册全部 `${def.type}.${hook}` 动作；`DESManager.restore()` 先解析所有动作名与事件，全部有效后再提交状态，失败时管理器保持调用前状态；`restore()` 同时复位 `statResetApplied` 与 `completeNotified`；`loadCheckpoint` 捕获失败并提示。

正例：新会话直接恢复含 Station hook 的快照成功。反例：恢复未知动作抛错且 `currentTime`/`pending`/`seed` 不变。

验证：`npx vitest run tests/des/rv-des-checkpoint.test.ts tests/des/rv-des-snapshot.test.ts tests/des/des-restore-atomicity.test.ts`

### M2 — 参考模型真正消耗仿真时间

`demo-robot-loading` 的源、机器人、indexing、station、path、sink 全部具备节拍/处理时间，产出通过事件流而非 `start()` 内同步遍历产生；`des-robot-loading-e2e.test.ts` 全绿且 `totalEventsProcessed` 与 MU 数量同量级。

验证：`npx vitest run tests/des/des-robot-loading-e2e.test.ts`

### M3 — 稳定端口方向在缩放父链下正确

`assemblyPortDirectionInOwner` 改用 `getWorldQuaternion`，新增带 uniform scale 与旋转的回归用例。

验证：`npx vitest run tests/assembly-port.test.ts tests/paintline-assembly.test.ts`

### M4 — 运行时生命周期

命名动作 handler 不再捕获 DESRunner；`DESRunner.dispose()` 清理 `scheduledRecords`；`RVViewer` 在置空 `_kernel` 前显式 `dispose()`。新增“两个 runner 互不串台”的回归用例。

验证：`npx vitest run tests/des/des-runner-lifecycle.test.ts tests/des/des-runner-gc-paths.test.ts`

### M5 — 事件队列与管理器热点

取消改为 id→事件索引；`nextModelEventTime` 变为 O(log n)；`getComponentByPath` 建索引；`onTimeAdvance` 仅在时钟前进时触发；`freeMuIds` 改用有序插入；快照迁移去掉整体深克隆；大数组 `Math.max(...)` 展开改为归约；`autoConnectByDistance` 提前算中心点。

正例：语义与顺序不变（既有 DES 全套通过）。反例：操作计数基线不回退。

验证：`npx vitest run tests/des/ tests/des/des-hotpath-baseline.test.ts`

### M6 — 数值、编辑器与装配一致性

分布钳位改为显式截断且可配置下限；`setMasterSeed` 重播种组件 RNG；智能资产编辑器 XML 转义与端口节点名去重；DES private-stub 与实际装配收敛。

验证：`npx vitest run tests/smart-asset-model.test.ts tests/des/rv-des-distribution.test.ts tests/simulation-kernel.test.ts`

### M8 — 关闭具名债务并跑通全量门禁

删除 16 个一行 re-export shim 并把测试导入改指核心路径；把 `tests/path/agv-*.test.ts` 从 `@rv-private` 迁到公开 runner 并重新生成排除列表；运行全量 Browser 与三条公开 Playwright 黄金流程，逐条归因剩余失败。

验证：`./scripts/verify.sh static`、`npm run test:node`、`npm test`、`npx playwright test e2e/public-des-flow.spec.ts e2e/paintline-assembly.spec.ts e2e/smart-asset-editor.spec.ts`

### M7 — 门禁与证据

运行 governance / static / node / 聚焦 browser / build，更新本计划与 `EP-DES-001` 的证据行、验收矩阵与契约备注，移入 completed。

## Progress

- [x] M1 快照恢复原子性
- [x] M2 参考模型真实仿真
- [x] M3 端口方向缩放修正
- [x] M4 运行时生命周期
- [x] M5 热点与基线
- [x] M6 数值/编辑器/装配一致性
- [x] M7 门禁与证据
- [x] M8 关闭具名债务并跑通全量门禁（2026-08-23 重新激活后完成）

## Surprises & Discoveries

- 复审确认 `EP-DES-001` 的浏览器证据行只统计了通过数；该失败与计划中已登记的 `tests.glb` LFS / SwiftShader 环境偏差无关，属模型缺陷。
- **M2 期间发现计划外 P0：`makeTransfer` 把显式 `routeIndex` 作用在“当前可接收”的过滤列表上，而不是声明拓扑。** 一旦某条下游满载，索引整体前移，MU 被静默改道（零件进空载具汇、空载具进零件线）。此前不可见，只因所有既有消费者的下游都是无限容量，从不被过滤。把参考模型改成真实排队后立刻暴露：2000 件里 396 件被改道进空载具汇。已按“显式车道满载 = 背压阻塞，越界索引保留旧回退”修复，并加 `tests/des/des-transfer-routing.test.ts`。生产组件 `RobotHandling` 的空载具路由同样依赖该语义。
- **M4 期间发现计划外增长问题：`scheduledRecords` 只在事件带 payload 时被回收。** 已注册 MU 且无 data 的事件（最常见形态）不产生 payload，其记录整轮运行都不释放。已把事件 id 放进 `ActionContext`，改为每个已派发事件都回收。
- 智能资产编辑器的端口节点重名并非缺陷：`AssetDocument.createEmptyNode` 已经通过 `uniqueChildName` 去重，故未改动。
- `dispatch()` 中“时钟未前进也触发 `onTimeAdvance`”这一项**主动不做**：该回调默认为 null（settle 闸门关闭时开销可忽略），而按时间戳去重会改变 `samplesLiveGeometry` 组件在同一时刻多事件下的观测语义，收益不足以承担该风险。已登记为已知债务。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-23 | 按复审结论执行 P0+P1 加固，不改契约与 Schema | 用户当前明确指令“同意评审，完成优化” | 缺陷均为实现层；保持交换格式与已保存数据不变可让修复独立回滚 |
| 2026-08-23 | 修正 `EP-DES-001` 的浏览器证据行而非重写其结论 | P0 测试完整性规则 | 完成计划是历史证据，应就地更正事实并注明来源，不得追溯粉饰 |
| 2026-08-23 | 本计划在 M7 完成后重新激活并追加 M8，而不是另开新计划 | 用户当前明确指令“完成未做的遗留项” | 债务是本计划自己具名的，闭环记录在同一份文档里比拆成孤立后续更可追溯；重新激活的事实在此显式登记 |
| 2026-08-23 | agv 测试迁移暴露的失败逐条归因后再处理，不整体接受也不整体跳过 | P0 测试完整性规则 | 7 例失败在 `f012911` 上同样存在；区分“公开 runner 真实缺陷”“测试观测点错误”后分别修复，避免用迁移掩盖产品缺口 |

## Validation

2026-08-23，本机 Chromium/SwiftShader、工作树 `develop`、基线 `f012911`：

- `./scripts/verify.sh static`：governance（54 份受治文档）、`assert-docs-publishable`、ESLint 边界门禁、社区 TypeScript 门禁全部通过。
- `npm run test:node`：59 文件 / 622 例通过、7 例按既有条件跳过。
- 受影响 Browser 范围（`tests/des/` + kernel + 稳定端口 + 智能资产编辑器）：**78 文件 / 424 例全部通过**。作为对照，改动前 `tests/des/` 为 68 文件 366 例含 1 例失败；现为 71 文件 379 例全绿，新增 3 个测试文件、13 个用例。
- `npm run build`：成功。入口 3,516,985 / 3,520,000 B（余 3,015 B，较改动前 3,220 B 净增 205 B），未提高预算；`tests/bundle-splitting.test.ts` 14/14 通过。
- 热点前后对比（同机、同一测试运行内比较两种队列规模，属诊断数据不是跨设备 SLA）：
  - 每帧完成检查：改动前 10k 挂起 0.48 ms/帧、50k 2.44 ms/帧；改动后 2k 与 40k 挂起下 200 帧均为 0.00 ms。
  - `cancelEvent`：改动前 10k 挂起时单次 0.32 ms（200 次 ≈ 64 ms）；改动后 40k 挂起下 200 次 ≈ 0.00–0.10 ms。
  - 参考负载：改动前 `totalEventsProcessed = 1`、`wallMs = 0`；改动后 12,196 事件、2,000 件产出、两次运行结果逐字段相同、`wallMs` 8.6–12.9 ms。
- 缺陷可复现性已逐条验证：M3 的缩放用例在临时回退实现后确认变红、恢复后变绿；M1 的半恢复状态与 M2 的单事件退化均由改动前探针实测记录在 Current Repository Facts。
- 未验证：真实 PLC/MQTT、客户/生产模型与连接、多浏览器/GPU 性能、人工双语 UX 巡检。

M8 追加验证（2026-08-23，同机）：

- `./scripts/verify.sh static`、`npm run test:node`（59 文件 / 622 例通过、7 跳过）、`npm run build` 通过；入口 3,517,097 / 3,520,000 B（余 2,903 B），`tests/bundle-splitting.test.ts` 14/14。
- `tests/des/` + `tests/path/`：85 文件 / 529 例全绿（agv 两个套件从 `@rv-private` 迁入后 18/18 通过）。
- 全量 Browser（`npm test`，排除 `drop-target-overlay`）：1,031 文件中 1,004 通过 / 22 失败 / 5 跳过；10,869 例中 10,761 通过 / 82 失败 / 24 跳过 / 2 todo。对照 `EP-DES-001` 记录的 27 文件 / 106 例失败。剩余失败逐文件归因见 Outcomes，均为 headless SwiftShader 上下文偏差，且在 `f012911` 上同样复现。**仍不声称全量 Browser 门禁通过。**
- Playwright 公开黄金流程 3/3 通过：`public-des-flow`、`paintline-assembly`、`smart-asset-editor`。`e2e/` 其余 spec 本轮未运行。

## Rollback

每个里程碑是独立提交，可单独 `git revert`。运行期新增结构不进入快照，回滚后旧快照与旧资产继续可读；`demo-robot-loading` 与测试的修改不影响产品数据。

## Outcomes & Retrospective

交付 6 类修复，其中 2 类是执行期间新发现的 P0/增长问题：

| 缺陷 | 位置 | 影响 |
| --- | --- | --- |
| 恢复非原子 + 动作懒注册 | `rv-des-manager.ts`、`des-runner.ts` | 新会话加载 checkpoint 抛错并留下半恢复运行时 |
| 参考模型不消耗仿真时间 | `demo-robot-loading.ts` | 8 h 参考负载只处理 1 个事件；特征测试长期红 |
| `routeIndex` 作用于过滤列表 | `des-runner.ts` `makeTransfer` | 下游满载时 MU 被静默改道（计划外发现） |
| 全局动作表捕获 runner 实例 | `des-runner.ts` | 旧 runner 无法回收；新 runner 记录写进旧实例 |
| `scheduledRecords` 不随事件回收 | `rv-des-event.ts`、`des-runner.ts` | 长跑期间线性膨胀（计划外发现） |
| 缩放父链下端口方向取值错误 | `assembly-port.ts` | uniform scale 资产的 rv-ODT 1.1 端口对齐到错误轴 |

同时收敛：每帧 O(n log n) 完成检查、O(n log n) `cancelEvent`、O(n²) 自动连接、快照迁移整体深克隆、大数组 `Math.max(...)` 展开、`freeMuIds` 的 O(N² log N) 维护、`getComponentByPath` 的后缀误匹配、`normal()` 的静默钳位、组件 RNG 不随种子重播、`RuntimeMetadata` XML 未转义，以及 DES private-stub 与实际装配的不一致。

### M8 追加交付（2026-08-23，本计划重新激活后）

M7 收尾时具名的债务已关闭，过程中又暴露并修复了 3 个既有缺陷：

| 事项 | 结果 |
| --- | --- |
| 16 个一行 re-export shim | 已删除；46 个文件的导入改指 `src/core/material-flow/des/`，`src/plugins/des/` 只保留 4 个真实模块 |
| `tests/path/agv-*.test.ts` 迁到公开 runner | 已迁移并从私有排除列表移出（生成器重跑：110 → 108 个私有依赖文件） |
| **`registerTweenSpec` 不解析 `pathRef`（既有 P0）** | `self.pathTween()` 对带 id 的路径只发 `pathRef`，`addPath` 收到 null 采样器后静默丢弃：DES 腿的事件照跑，但视觉从不沿路径移动。只有 `restoreFrozenTween` 解析该 ref，所以缺陷只在故障/恢复路径之外全程隐身。已修复并加 `tests/des/des-path-tween-ref.test.ts`（临时回退实现确认变红） |
| **`EventQueueOverlay` 从未被注册（既有）** | 事件队列诊断面板被嵌在 `DESControllerToolbar` 内渲染，overlay 模块及其私有 stub 成为死代码，`des-workspace-coupling` 的 overlay 断言自 EP-DES-001 起长红。已按设计接入 `overlay` slot 并移除工具栏内的重复挂载（同一 store 驱动，行为等价，Playwright 黄金流程验证通过） |
| **`smart-asset-editor.spec.ts` 从未真正执行（既有）** | 该 spec 是唯一没有设置软件 GL 启动参数的公开 E2E，headless Chromium 拿不到 WebGL 上下文，30 s 后卡在等待 canvas —— 其后所有编辑器断言从未运行。补齐与 DES/涂装线 spec 相同的参数后 16.6 s 通过 |
| **`paintline-assembly.spec.ts` 既有 flake** | 在 poll 到 `valid` 之后用非 poll 方式读同一个最终一致的 runtime 记录，约三次一失败（`f012911` 上 3 次跑 2 通过 1 失败，确认非本轮引入）。断言值不变，改为与相邻读取一致的 poll；连跑 4 次全绿 |
| `tests/des-workspace-coupling.test.ts` 的假 viewer | 缺 `getPlugin`，导致 `DESHMIPlugin.ensureViewer` 抛错、5 例耦合断言从未执行。补全 stub |

遗留债务（仍未做，已具名）：

- `dispatch()` 的 `onTimeAdvance` 仍每事件触发（见 Surprises，权衡后主动保留：回调默认为 null，按时间戳去重会改变 `samplesLiveGeometry` 组件在同一时刻多事件下的观测语义）；
- 入口预算余量 2,903 B，下一个特性前应安排一次入口瘦身；
- 全量 Browser 仍有 22 个文件 / 82 例失败，全部落在 headless SwiftShader 的 WebGL/WebGPU 上下文创建失败（14 个文件）与 `embed-*` 组（8 个文件）。**注意**：`EP-DES-001` 把 `embed-*` 归因为“130 B Git LFS 指针 + 缺 git-lfs”，本机复核不成立——`public/models/tests.glb` 是真实的 36 MB 文件且 `git-lfs` 已安装；这些用例单独重跑仍报 WebGL 上下文创建失败，属同一 SwiftShader 偏差。该归因更正登记在此，未进一步排查。
