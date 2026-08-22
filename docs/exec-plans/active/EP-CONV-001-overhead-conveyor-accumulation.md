---
doc_id: EP-CONV-001
title: 悬挂链积放模式与蛇形缓冲段
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-22
authority: normative-process
---

# EP-CONV-001：悬挂链积放模式与蛇形缓冲段

## Purpose

按 Accepted [`ADR-0002`](../../adr/ADR-0002-overhead-conveyor-accumulation.md) 为 `OverheadConveyor` 实现可选的积放（power-and-free）模式，并用它在涂装线演示中建成一段**蛇形积放缓冲段**：挂具在缓冲段排队蓄积，按放行闸的信号逐个放行。

用户可观察到的成功标准：

1. 打开演示场景，缓冲段中的挂具**间距不再恒定**——闸关闭时后车依次贴近前车并停住，队列可见地变密。
2. 闸打开后挂具逐个启动、间距重新拉开，队列可见地疏散。
3. 主线其余部分节奏不变，工艺段停留时间不受缓冲段影响。
4. 单独加载 `PaintLineOverheadConveyor.glb`（不经演示插件包）时链条也能正常显示运动——先决缺陷已修。
5. 任何既有资产不写 `Mode` 时行为与今天逐位一致。

## Scope

- `src/behaviors/OverheadConveyor.ts`：新增 `Mode` 分支、按载具 `PathTraveler`、车跟随速度求解、放行闸。
- `src/core/engine/rv-freeze-static.ts`、`src/core/engine/rv-scene-loader.ts`：把 `OverheadConveyor`/`Carrier` 纳入两套「会不会动」分类（先决缺陷）。
- 组件在位置推进时自行 `markRenderDirty`。
- `scripts/build-paintline-library.mjs`：新增蛇形缓冲段轨道几何与闸位置；接管 `public/library/PaintLine/`。
- `scripts/build-paintline-scene.mjs`：把缓冲段并入演示场景。
- 对应 Node 单测与 Playwright 场景（含渲染层断言）。

## Non-goals

- **不做 DES**。`ADR-0002` Decision 第 5 条明确禁止在本次实现中加入 `des` 块，哪怕是半成品。积放接入 DES 需要独立设计与新 ADR。
- **不改 `schema/v1`**。组件 schema 由 `defineLibraryComponent` 自注册，新增字段是纯加法。
- **不做同一环线上的分段动力/自由切换**。`ADR-0002` Rollback 节点明确该能力需要新 ADR。
- **不做 M4 的另外两项**（喷房六轴机器人 IK、节拍与产量 KPI）。
- **不改 `Conveyor` 的 glob**。`*Conveyor*` 与 `*OverheadConveyor*` 的重叠（`EP-DEMO-001` Surprises 第 8 条）是既有公共契约问题，需另立计划。
- **不动 `Agv.ts`**。复用其消费范式，但不重构它。

## Required Documents and Decisions

- Accepted [`ADR-0002`](../../adr/ADR-0002-overhead-conveyor-accumulation.md) —— 本计划的唯一授权来源
- [`../../governance/DEVELOPMENT_CONSTITUTION.md`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`../../governance/AI_SAFETY.md`](../../governance/AI_SAFETY.md)
- [`../../governance/CHANGE_MANAGEMENT.md`](../../governance/CHANGE_MANAGEMENT.md) §6 黄金切片、[`../../governance/DEFINITION_OF_DONE.md`](../../governance/DEFINITION_OF_DONE.md)
- Completed [`EP-DEMO-001`](../completed/EP-DEMO-001-paintline-demo.md) —— 其 Surprises 第 14–20 条是本计划的事实基础与遗留债务交接
- [`../../governance/OPEN_DECISIONS.md`](../../governance/OPEN_DECISIONS.md) —— 经核对，OD-001/003/004/005/006 均不覆盖本范围

## Current Repository Facts

开始时分支 `develop`，工作树含 `EP-DEMO-001` 的收尾提交。以下经代码核对：

| 事实 | 位置 |
| --- | --- |
| 组件当前只有一个链相位标量，间距恒定；积放是其注释中明确未实现的 follow-up | `src/behaviors/OverheadConveyor.ts` |
| `PathTraveler`：`s`/`v`/`blocked`/路径交接 | `src/core/engine/rv-path-traveler.ts:50` |
| `SpacingController`：按 `s` 排序的一维车头时距，**显式支持闭合路径回绕**；每 tick 一次快照，读者顺序无关 | `src/core/engine/rv-spacing-controller.ts:104` |
| `computeCarFollowingSpeed` + `HEADWAY_STOP_EPS_MM_S`（有限步收敛到 0） | 同上 `:58` |
| 完整消费范例：`add(traveler,{lookAhead})` → 每 tick `gapOf` → 车跟随 → `minGap` 钳制 → dispose 时 `remove` | `src/behaviors/Agv.ts:582,677,771` |
| 刚性链的特征测试（兼容性护栏） | `tests/path/overhead-conveyor-loop.test.ts`，9 个用例 |
| **先决缺陷**：`MOVER_KEY` 不含 `OverheadConveyor` → 冻结矩阵 | `src/core/engine/rv-freeze-static.ts:59` |
| **先决缺陷**：`MOTION_KEY = /^Drive\|^Kinematic(_\d+)?$/i` 不含 → 网格并入根挂载静态 arena，*"cannot move by construction"* | `src/core/engine/rv-scene-loader.ts:518` |
| 按需渲染只由运行中的 `RVDrive` 标脏 | `src/core/engine/rv-core-subsystems.ts:172` |
| 演示层现有绕开手段（本计划修好核心后应评估移除） | 挂具上的 `Kinematic` 标记、`src/plugins/models/DemoPaintLine/chain-redraw.ts` |

## State Ownership and Compatibility

| 状态 | 归属 | 兼容性 |
| --- | --- | --- |
| `rigid` 的 `s_chain` | 组件实例（现状不变） | 特征测试逐条保持通过 |
| `accumulating` 的每载具 `s` | 该载具的 `PathTraveler`（唯一真相，见 ADR-0002 长期约束） | 新增，不影响 `rigid` |
| 车头时距快照 | 共享 `defaultSpacingController` | 与 `Agv` 共用同一实例，注册/注销必须成对 |
| 闸状态 | `PLCInputBool` 信号 | 新增公开契约，只加不减 |
| 挂具位姿 | 组件写入节点 local 帧（现状不变） | 不改重力定向逻辑 |

`Mode` 缺省即 `rigid`，因此所有既有 GLB、场景与项目零迁移。

## Allowed Paths

- `src/behaviors/OverheadConveyor.ts`
- `src/core/engine/rv-freeze-static.ts`
- `src/core/engine/rv-scene-loader.ts`（仅 `MOTION_KEY` 分类）
- `scripts/build-paintline-library.mjs`
- `scripts/build-paintline-scene.mjs`
- `public/library/PaintLine/`、`public/library/catalog.json`、`public/scenes/DemoPaintLine.glb`
- `src/plugins/models/DemoPaintLine/`（仅在核心修好后评估精简绕开手段）
- `tests/`、`e2e/`
- `docs/exec-plans/active/EP-CONV-001-overhead-conveyor-accumulation.md`、`docs/exec-plans/active/README.md`

## Forbidden Paths

- `schema/`
- `src/behaviors/`（`OverheadConveyor.ts` 除外——尤其**不得**改 `Conveyor.ts` 的 glob 或 `Agv.ts`）
- `src/core/`（上列两个分类文件除外）
- `public/library/PalletHandling/`、`public/models/`
- `src/core/i18n/`（本计划不新增用户可见文案；若 M3 需要则先追加路径并记录）

## Milestones

### M1 — 先决：让悬挂链在渲染管线里可动

把 `OverheadConveyor`/`Carrier` 纳入 `MOVER_KEY` 与 `MOTION_KEY`，并让组件在推进位置时自行 `markRenderDirty()`。

**正例**：`?model=/library/PaintLine/PaintLineOverheadConveyor.glb` 单独加载时，画布像素随时间变化。
**反例**：链条 `Run=false` 时不再每帧标脏（按需渲染的节省不被无条件牺牲）。
**验证**：新增 E2E 断言单独加载库对象时画布重绘；`EP-DEMO-001` 的 15 条 E2E 全部保持通过。修好后评估 `chain-redraw.ts` 与挂具 `Kinematic` 标记是否可移除——**只有在移除后渲染断言仍通过时才移除**。

### M2 — 积放模式（黄金切片）

`Mode: 'rigid' | 'accumulating'`，默认 `rigid`。`accumulating` 下每挂具一个 `PathTraveler`，注册进 `defaultSpacingController`，速度 = `computeCarFollowingSpeed(gapOf, SafetyDistance, HeadwayGain, TargetSpeed)` 再经 `MinGap` 硬钳制与既有 `computeRampedSpeed` 斜坡。

**正例**：人为让队首减速，后车依次贴近并稳定在 `MinGap`，不穿透。
**反例**：`rigid` 下不创建任何 traveler；`accumulating` 下不读 `s_chain`；dispose 后 `SpacingController` 中该实例的 traveler 全部移除。
**验证**：`tests/path/overhead-conveyor-loop.test.ts` 9 条**不修改且通过**；新增确定性用例覆盖闭环回绕点两侧的排队一致性。

### M3 — 放行闸

`Gate` 配置：路径上的弧长位置 + 控制信号（`PLCInputBool`，真=放行）。闸关闭时最近的上游 traveler 被钳在闸位置。

**正例**：闸关 → 队列蓄积；闸开 → 逐个放行、间距重新拉开。
**反例**：闸位置落在回绕点附近时行为与别处一致；多闸互不干扰。
**验证**：Node 用例断言钳位精度与放行顺序；E2E 断言闸开关时画布确实变化。

### M4 — 蛇形缓冲段并入演示场景

在库生成器中新增蛇形轨道几何与闸，把缓冲段并进 `DemoPaintLine.glb`，主线工艺段节奏不受影响。

**验证**：渲染层断言缓冲段挂具间距随闸状态变化；生成器字节可复现；人工视觉验收对照参考动画。

## Progress

- [x] M1 先决渲染修复 —— 2026-08-22 完成，证据见 Validation「M1 实际执行证据」
- [x] M2 积放模式 —— 2026-08-22 完成，证据见 Validation「M2 实际执行证据」
- [ ] M3 放行闸
- [ ] M4 蛇形缓冲段
- [ ] Outcomes 与证据补齐

## Surprises & Discoveries

M1 执行期发现：

1. **不能只给输送链根节点打标——必须逐个识别挂具**。最初想法是把 `OverheadConveyorBehavior` 加进两套分类。对冻结通道可行（`MOVER_KEY` 会连带保活整个子树），但对网格合并是错的：合并按**最近的运动节点逐个锚定**，给容器节点打标会把 40 个挂具并进同一个随根节点整体移动的 arena，它们之间反而不能相对运动。`rv-scene-loader.ts:513-516` 的注释正好警告过这一点——*"anchoring meshes to them would mis-group whole subtrees"*，那是排除 KinematicJoint/Mechanism 的理由。因此两套分类都改为识别**挂具本身**，且复用组件已有的 `isCarrierName` SSOT，而不是写第四份正则。

2. **名称身份与 KD-002 的张力（已评估，判定不扩大）**。[`KNOWN_DEVIATIONS.md`](../../governance/KNOWN_DEVIATIONS.md) KD-002 的围栏是「新功能不得继续扩大名称身份依赖」。本次让核心加载器按 `Carrier` 名称约定分类，表面上像是扩大。判定为**不扩大**：该名称约定并非本次引入——`OverheadConveyor` 组件本身就用 `NODE_KIND_TESTS.carrier` / `isCarrierName` 发现挂具，它已经是挂具身份的既有机制；本次是让加载器与组件**对齐到同一个判定函数**，消除「两套分类互相不知道」这一类 bug（该文件自己记录过同类事故）。若日后 KD-002 推进到稳定端口 ID，本处应随之迁移，届时只需改 `isCarrierName` 一处。

3. **渲染标脏是与冻结/合并**独立**的第三道关卡**。修好两套分类后，单独加载库对象仍然冻结：按需渲染只由运行中的 `RVDrive` 标脏（`rv-core-subsystems.ts:172`），而这条链没有 drive。组件现在在位姿推进后自行 `markRenderDirty()`，并以 `moving` 为条件，保住链条停止时的按需渲染节省（已由反例断言锁定）。

4. **演示层的两处绕开手段已按 M1 要求移除并验证**：挂具上的 `Kinematic` 标记与 `chain-redraw.ts` 插件全部删除后，三个场景（完整场景 / 停掉喷房 drive / 单独加载库对象）画面均刷新。核心修复独立成立，不再依赖任何演示层补丁。

5. **浏览器门禁的 22 个失败文件是本机既有失败**。改动前后用 `git stash` 做了基线对照：两次均为 22 文件 / 82 用例失败，**失败文件集逐行相同**（clipping、dissolve、embed、thumbnail、webgpu 等，本机无硬件 GPU 且缺 `dist-embed`）。与本次改动无关，如实登记而非声称门禁全绿。

M2 执行期发现：

6. **`iterateFixedUpdate(handle, dt)` 只有两个参数，没有次数**。我按 `(handle, dt, n)` 写了测试，多余的第三个参数被静默忽略，于是每次调用只推进一个 tick。症状极具误导性：断言失败信息是「走了 0.0167 m，期望 > 0.9」，看上去像积放把整条线刹停了，实际上组件完全正常。加了本地 `tick(handle, n)` 辅助函数并写明原因。**既有的刚性链测试没有这个问题**——它们本来就用 `for (…) iterateFixedUpdate(handle, TICK)` 循环，所以「9 条特征用例未修改且通过」这条兼容性证据不受影响。

7. **未知 `Mode` 值一律按 `rigid` 处理**。实现里用严格等于 `'accumulating'` 判定，而不是「非 rigid 即积放」。理由是拼写错误绝不能静默改变已发布资产的行为；已由 `Mode: 'accumulate'`（少一个 g）的用例锁定为 0 个 traveler。

8. **`MinGap > SafetyDistance` 会让硬钳制与车跟随斜坡互相打架**，实现中检测到即告警并把 `MinGap` 收敛到 `SafetyDistance`，而不是放任两者冲突产生抖动。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因 |
| --- | --- | --- | --- |
| 2026-08-22 | 接受 `ADR-0002`，创建本计划并直接以 `approved / active` 开工 | 用户在会话中的明确指令（「批准 ADR-0002，建 ExecPlan 开工」） | 用户已审阅 ADR 的 Decision 与 Alternatives 后批准；批准来源按 `exec-plans/proposed/README.md` 要求记录于此 |
| 2026-08-22 | 先把 `EP-DEMO-001` 补齐 Outcomes 并转入 `completed/`，再开本计划 | Agent 的流程决定 | 本计划要写 `public/library/PaintLine/` 与两个生成器，与 `EP-DEMO-001` 的 Allowed Paths 重叠；`CHANGE_MANAGEMENT` §4 要求同一批路径单写者，两个活动计划同时持有会违反该规则 |
| 2026-08-22 | 先决渲染修复列为 M1 而非与积放并行 | `ADR-0002` Decision 第 7 条与 Validation 节 | 积放让每挂具独立运动；若分类缺陷未修，M2/M3 的任何视觉验证都不可信 |

### M1 实际执行证据（2026-08-22）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| 治理门禁 | `./scripts/verify.sh governance` | 通过（39 篇受管文档） |
| 静态门禁 | `./scripts/verify.sh static` | 退出码 0 |
| Node 门禁 | `./scripts/verify.sh node` | 556 passed / 7 skipped |
| **刚性链特征用例** | `npx vitest run tests/path/overhead-conveyor-loop.test.ts` | **9 passed，文件未修改** |
| 浏览器门禁 | `./scripts/verify.sh browser` | 22 文件 / 82 用例失败，**与基线逐行相同**（见 Surprises 第 5 条） |
| 新增渲染回归 | `npx playwright test e2e/overhead-conveyor-render.spec.ts` | 2 passed |
| 涂装线既有 E2E | `npx playwright test e2e/paintline-*.spec.ts` | 16 passed |

移除演示层绕开手段后的三场景实测（画布逐字节比较）：

| 场景 | 挂具位移 | 画面 |
| --- | --- | --- |
| 完整演示场景 | 1.347 → 2.617 m | 在刷新 |
| 完整场景 + 停掉喷房 drive | 2.062 → 3.357 m | 在刷新 |
| **单独加载库对象（无插件包、零 drive）** | 4.087 → 6.304 m | **在刷新** |

**M1 未验证项**：硬件加速环境下的表现（全部证据来自 SwiftShader）；把挂具从静态合并中排除对大场景的性能影响未实测（40 挂具无可见影响）。

### M2 实际执行证据（2026-08-22）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| **刚性链特征用例（兼容性护栏）** | `npx vitest run tests/path/overhead-conveyor-loop.test.ts` | **9 passed，文件 diff 为空** |
| 新增积放用例 | `npx vitest run tests/path/overhead-conveyor-accumulation.test.ts` | **9 passed** |
| 静态门禁 | `./scripts/verify.sh static` | 退出码 0 |
| Node 门禁 | `./scripts/verify.sh node` | 556 passed / 7 skipped |
| 治理门禁 | `./scripts/verify.sh governance` | 通过 |

积放用例覆盖（均为 ADR-0002 点名的静默失败点）：

- `rigid` 模式注册 **0** 个 traveler；`accumulating` 注册 **N** 个；dispose 后归 **0**——共享的 `SpacingController` 是全场景的，残留条目会给真实 AGV 制造不存在的前车。
- 未知 `Mode` 退回 `rigid`。
- 稀疏环线（2 挂具 / 20 m）不被车头时距拖慢，1 秒走满 1 m。
- 紧密播种（pitch 0.5 m < SafetyDistance 1 m）下，600 tick 内相邻间距**从未跌破 `MinGap`**。
- **闭环回绕确实生效**：满环紧密播种时间距离散度不随时间发散（若队首的前车不是队尾，它会无约束跑掉并把环拉开）。
- `Run=false` 后全部挂具静止且 `Moving` 为 false。

**M2 未验证项**：视觉表现（本里程碑无可见的排队现象——要形成队列需要 M3 的放行闸，届时补渲染层断言）；大规模载具数下 `SpacingController` 每 tick 排序的性能。

## Validation

- `./scripts/verify.sh governance` / `static` / `node` / `browser` / `build`
- `tests/path/overhead-conveyor-loop.test.ts` 9 条特征用例保持不变且通过（`rigid` 未被改动的证据）
- 新增 Node 用例：traveler 生命周期、无泄漏、模式互斥、闸钳位与放行
- **渲染层断言（ADR-0002 硬性要求）**：截取真实渲染画布比较字节，覆盖「单独加载库对象」「闸开关」两处；仅断言 `position`/信号不充分
- `EP-DEMO-001` 交付的 15 条涂装线 E2E 全部保持通过
- 生成器字节可复现
- 性能：记录 40 挂具场景的 tick 耗时；不对大规模场景作未实测声明

## Rollback

- M1：分类改动可单独还原；还原后演示层的 `Kinematic` 标记与 `chain-redraw.ts` 必须一并恢复，否则演示场景回到画面冻结。
- M2/M3：`Mode` 分支整体摘除即回到 `rigid`，`rigid` 代码路径全程未被改动。
- M4：缓冲段几何与场景条目为纯新增，删除后重跑两个生成器即可。
- 无 Schema 变更、无持久化迁移、无外部状态。

## Outcomes & Retrospective

（完成后记录实际结果、验证证据、偏差、未验证项、债务与后续任务。）
