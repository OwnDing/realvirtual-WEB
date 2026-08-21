---
doc_id: ADR-0002
title: 悬挂链积放（power-and-free）的状态模型
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# ADR-0002：悬挂链积放（power-and-free）的状态模型

> **Accepted 2026-08-22.** 批准来源：用户在会话中的明确指令（「批准 ADR-0002，建 ExecPlan 开工」）。
> 实施由 [`EP-CONV-001`](../exec-plans/active/EP-CONV-001-overhead-conveyor-accumulation.md) 承接；本 ADR 本身不授权其 Allowed Paths 之外的任何改动。

## Context

涂装线演示（[`EP-DEMO-001`](../exec-plans/completed/EP-DEMO-001-paintline-demo.md)）已交付 M1–M3：一条闭合悬挂链带动 40 个挂具匀速循环，穿过四个工艺段。参考工艺动画中占面积最大的一段是**蛇形积放缓冲段**——挂具在此排队蓄积、按节拍放行。M4 要做这一段，而它无法用当前的状态模型表达。

**当前实现的事实**（`src/behaviors/OverheadConveyor.ts`，经代码核对）：

- 整个组件只有**一个链相位标量** `s_chain`。第 `i` 个挂具的位置是 `(s_chain + i·pitch) mod L`，间距恒定，永远不会变。
- 组件自身的模块注释把积放列为**明确未实现的 follow-up**，原话：*"Accumulating FREE trolleys (power-and-free with a signed gap clamp) are a documented FOLLOW-UP, not part of this component: they need per-carrier travelers instead of the one chain scalar — the Phase-2 SpacingController closed-wrap is ready to be reused for that."*
- 同一注释说明该组件**刻意不提供 `des` 块**：刚性链没有离散到达事件可建模。

**现成的可复用件**（不需要新造）：

| 能力 | 位置 | 与积放的关系 |
| --- | --- | --- |
| `PathTraveler` —— 路径图上的单体行进状态（`s`、`v`、`blocked`、路径交接） | `src/core/engine/rv-path-traveler.ts` | 每个自由小车一个 |
| `SpacingController` —— 按弧长排序的一维车头时距，**显式支持闭合路径回绕**（*"closed path → the frontmost wraps around to the hindmost (gap mod L)"*） | `src/core/engine/rv-spacing-controller.ts` | 积放的核心：排队就是间距受限 |
| `computeCarFollowingSpeed` —— `v = clamp((gap − safety)·k, 0, vMax)`，含有限步收敛到 0 的 `HEADWAY_STOP_EPS_MM_S` | 同上 | 平滑刹停与重启 |
| 完整消费范例：注册、每 tick `gapOf` → 车跟随 → `minGap` 硬钳制、dispose 时 `remove` | `src/behaviors/Agv.ts` | 逐行照搬即可，不必重新设计 |

也就是说，**积放缺的不是算法，而是一个关于状态归属的决定**：把「一个链标量」换成「N 个行进者」是组件状态所有权的改变，按 [`CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md) §2 属于必须先出 ADR 的范围，且该选择会长期约束后续的 DES、PLC 接口与资产约定。

**没有 OD 阻塞**：[`OPEN_DECISIONS.md`](../governance/OPEN_DECISIONS.md) 中 OD-001/003/004/005/006 均不覆盖本决策范围。

**一个先决缺陷（非本 ADR 决策项，但必须一并解决）**：加载器的两套「会不会动」分类都不认识 `OverheadConveyor`——`rv-freeze-static.ts` 的 `MOVER_KEY` 会冻结其矩阵，`rv-scene-loader.ts` 的 `MOTION_KEY` 会把其网格并入根挂载静态 arena（该文件原话 *"which cannot move by construction"*）。后果是链条在仿真中完美运行而画面纹丝不动，实测 `Carrier-01.position.z` 由 5.05 m 走到 8.45 m 而画布逐字节相同。演示层已用资产标记绕开，核心层未修，详见 `EP-DEMO-001` Surprises 第 17、19 条。积放让每个挂具独立运动，只会让这个缺陷更显眼。

## Decision

**积放作为 `OverheadConveyor` 的一个可选模式实现，不新建组件；两种状态模型在同一实例内互斥，绝不混用。**

1. **模式开关**。组件 schema 增加 `Mode: 'rigid' | 'accumulating'`，**默认 `rigid`**。现有资产不写该字段即保持今天的行为，逐位一致。

2. **状态所有权**。
   - `rigid`：维持现状——组件自己拥有唯一的 `s_chain` 标量，挂具位置由它整体推导。
   - `accumulating`：组件为每个 `Carrier-<id>` 节点创建一个 `PathTraveler`，注册进共享的 `defaultSpacingController`；**每个挂具的 `s` 由它自己的行进者拥有**，组件不再持有全局相位。`s_chain` 在该模式下不存在，也不得作为回退值被读取。

3. **速度求解逐行复用 `Agv.ts` 的既有链路**，不另造车跟随模型：每 tick 取 `gapOf(id)` → `computeCarFollowingSpeed(gap, SafetyDistance, HeadwayGain, TargetSpeed)` → 在其上施加 `MinGap` 硬钳制（弧长间距不得低于此值）→ 交给既有的 `computeRampedSpeed` 走加减速。挂具位姿仍用现有的重力定向逻辑（仅偏航取自切线），不改。

4. **放行闸（release gate）是积放模式的一等概念**。只有间距控制不构成缓冲段——必须有东西让队列停住。新增 `Gate` 配置：路径上一组弧长位置，每个由一个 `PLCInputBool` 信号控制。闸关闭时，其上游最近的行进者被钳在闸位置，后车依车跟随自然蓄积；闸打开时依次放行。这是「蛇形缓冲段」得以成立的机制。

5. **本 ADR 的切片只承诺连续（60 Hz）模式，不提供 `des` 块**。理由与刚性链不同：积放**确实**有离散事件（到闸、被阻塞、放行），但把它接进 DES 需要与 `Blockade-Reschedule` 的交互设计，以及队列在事件驱动下的重排语义——那是独立的一次设计，不应搭车通过。此处显式记录为有边界的 follow-up，并禁止在实现中偷偷加入半成品 `des` 块。

6. **不改 `schema/v1`**。该组件的 schema 由 `defineLibraryComponent` 运行时自注册，不属于 rv-ODT 正式契约，新增字段是纯加法，rv-ODT 契约零变更。

7. **先决条件**：实现积放的同一个 ExecPlan 必须先修复上文的分类缺陷（把 `OverheadConveyor`/`Carrier` 纳入 `MOVER_KEY` 与 `MOTION_KEY`，并让组件在相位/位置推进时自行 `markRenderDirty`），否则积放做完也看不见。该修复不改变任何契约，属于缺陷修复而非架构决策，因此不单独立 ADR，但列为本 ADR 的验证前置。

## Alternatives

**A. 新建独立的 `PowerAndFreeConveyor` 组件，刚性链完全不动。**
未采用。真实的 power-and-free 是**一套**系统——上方动力链、下方可脱开蓄积的自由小车，同一条环线上既有动力段也有积放段。拆成两个组件会强迫资产在环线中间断开成两个对象，而演示里的蛇形缓冲段与主线本就是同一条闭环。此外会重复实现路径发现、挂具发现、位姿定向三套逻辑，并让「同一物理概念两个组件」成为长期负担。

**B. 用 `Transport` 表面 + 既有 `Conveyor` 的 ZPA 分区累积来建模缓冲段。**
未采用。ZPA 是**皮带**语义：MU 躺在表面上，分区由 `Transport-*`/`Sensor-*` 节点定义。悬挂链的载具是挂在轨道上的点，沿弧长运动、且要在两个 180° 弯道上连续通过——用表面分区表达需要把闭环切成大量首尾相接的直段，几何与语义都失真。而 `SpacingController` 本就是为弧长排队设计的。

**C. 保留单一链标量，用「可变 pitch」近似蓄积。**
未采用。看起来最小改动，实则不成立：蓄积的本质是**每个载具独立决定走或停**，用一个全局标量加每项偏移无法表达「前车停、后车逐个贴上来」，也无法表达放行时的逐个启动。会得到一个看着像积放、但任何定量断言都对不上的假象——这正是本项目已经吃过亏的那类缺陷。

**D. 直接在本 ADR 里连 DES 一起定。**
未采用，但保留为 follow-up。见 Decision 第 5 条。

## Consequences

**正面**

- 蛇形积放缓冲段成为可表达的模型，M4 得以推进；同时补齐组件自身注释里挂了很久的 follow-up。
- 复用 `PathTraveler` + `SpacingController` + `Agv` 的消费范式，新增代码集中在「模式分支 + 闸」，车跟随、闭环回绕、确定性快照这些难点都不需要重新验证。
- 默认 `rigid` 使全部既有资产零影响，风险被模式开关隔离。

**代价**

- 组件内出现两套状态模型，认知成本上升。缓解：模式在 `setup` 时一次性决定，两条路径不共享可变状态，且用测试锁定「`rigid` 下不创建任何 traveler、`accumulating` 下不存在 `s_chain`」。
- 性能由 O(1) 变为 O(N log N)/tick（`SpacingController` 每 tick 按 `s` 排序）。40 个挂具无压力；上千个载具的场景需要实测，本 ADR 不为其背书。
- 每个挂具独立运动意味着分类缺陷不再能靠「场景里恰好有别的 drive」蒙混过去，先决修复成为硬约束。

**长期约束**

- 一旦 `accumulating` 发布，`PathTraveler` 的 `s` 成为该模式下挂具位置的唯一真相，任何后续的 DES、录制回放、多人同步都必须以它为准，不得再引入第二个位置来源。
- `Gate` 的信号语义（`PLCInputBool`，真=放行）一旦发布即为公开契约，只加不减。

## Compatibility and Migration

- **现有 GLB**：不写 `Mode` 即 `rigid`。`public/library/PaintLine/PaintLineOverheadConveyor.glb` 及任何第三方资产行为不变。
- **现有场景/项目**：`OverheadConveyorBehavior` 的既有字段（`TargetSpeed`、`Acceleration`、`UseAcceleration`、`PathId`、`Pitch`、`StartPhase`）在两种模式下含义不变；`Pitch`/`StartPhase` 在 `accumulating` 下用于**初始**布点，之后不再约束间距。
- **信号契约**：`OverheadConveyor.Run/.Moving/.Position` 保持发布。`.Position` 在 `accumulating` 下定义为**队首行进者的弧长**（mm），并在文档与 schema 描述中写明这一语义差异；不复用旧字段承载新含义之外的东西。
- **持久化**：行进者状态是运行时态，不写入 GLB/项目；重载后由 `StartPhase` + `Pitch` 确定性重建。
- **无迁移脚本**：纯加法，无需转换既有数据。

## Validation

- `tests/path/overhead-conveyor-loop.test.ts` 现有 9 个特征用例必须**保持不变且通过**——这是 `rigid` 未被改动的证据。
- 新增 Node 用例：`rigid` 下不注册任何 traveler；`accumulating` 下 traveler 数等于挂具数、dispose 后从 `SpacingController` 全部移除（不泄漏）。
- 新增确定性用例：闸关闭后队列在闸上游按 `MinGap` 收敛且不穿透；闸打开后逐个放行；跨闭环回绕点的排队与放行行为与不跨越时一致。
- **必须包含渲染层断言**：截取真实渲染画布比较字节，证明积放确实可见。仅断言 `position`/信号是不充分的——`EP-DEMO-001` 的三个里程碑正是这样全部「通过」而画面从未变化过。
- 性能留证：40 挂具场景下记录 tick 耗时；不对大规模场景作未经实测的性能声明。

## Rollback or Supersession

- **回滚**：把 `Mode` 从资产中移除即回到 `rigid`；代码层面模式分支可整体摘除而不触碰 `rigid` 路径。无 Schema 变更、无持久化迁移、无外部状态，回滚不影响任何既有场景。
- **替代条件**：若后续要把积放接入 DES，或要支持「同一环线上分段切换动力/自由」，需要新的 ADR 替代或扩展本文；本 ADR 不预先授权那些变化。
