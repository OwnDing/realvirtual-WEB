---
doc_id: ADR-0005
title: 公开 DES 采用行业无关内核与可注册适配层
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# ADR-0005：公开 DES 采用行业无关内核与可注册适配层

接受依据：用户于 2026-08-22 要求评估 `EP-DES-001`，并在整体认可后先提交、推送文档，再完成全部阶段。本轮代码与测试现状复核后接受本决策。

## Context

公开仓库已有 `SimulationKernel`、`MaterialFlowDefinition`、结构化适配接口、拓扑、动画 tween、统计、DES 工作区和实验 UI 的公开部分，但真正的调度器、运行器、快照存储和事件队列 UI 仍通过 `@rv-private` 注入。当私有 sibling 不存在时，`createDesRunner` 是 `null`，公开构建只能连续仿真，DES 工作区显示不可用。

用户已明确要求公开 DES，同时强调产品不只服务涂装线。如果直接把 `PaintLineAssembly` 的载具和工艺语义下沉到 DES 内核，会使调度、快照和统计长期绑定一个行业。反之，只复制一批私有文件到公开 `plugins/des` 也会保留“公共内核依赖可选产品层”的错误边界。

该变更会改变公开/可选模块边界、DES 时间推进和快照一致性契约，因此必须由 ADR 固定。

## Decision

1. **纯 DES 内核公开且行业无关。** 事件队列、时钟/调度、随机数/分布、MU/组件运行态、命名动作、快照编解码和通用统计放入 `src/core/material-flow/des/`。该目录不导入 React、MUI、`RVViewer`、项目演示或任何 `PaintLine*` 类型。
2. **宿主适配和 UI 与内核分离。** 场景扫描、`RVViewer` 生命周期、工作区、事件队列/统计/实验面板和 IndexedDB 宿主适配放在 `src/plugins/des/` 及现有 `src/plugins/sim-controller/`。公开 `SimulationExecutor`/`SimDesControl` 仍是 Viewer 与运行器之间的窄接口。
3. **行业能力通过注册表和适配器接入。** 现有 `MaterialFlowDefinition` 是组件扩展契约；连续与 DES 调用同一 `logic`/`setup`，各自使用窄 `continuous`/`des` adapter。源、汇、处理、缓冲、输送、路由、资源和故障是公开通用组件；涂装、焊装、仓储等业务概念必须位于行为或插件层。
4. **确定性排序是公共契约。** 事件按 `(time ASC, priority DESC, sequence/id ASC)` 排序；同一模型、参数、随机种子和运行终止条件必须得到相同业务结果。快照只存稳定动作 ID 和 JSON 状态，不存闭包、DOM 或 Three.js 对象。
5. **回压与实体交接使用拓扑握手。** `canAccept(mu)`/`onDownstreamReady` 是 DES 内部权威；`Flow.Occupied` 保持连续仿真与 PLC 观测/覆盖界面，不用异步信号订阅代替确定性握手。
6. **运行模式共用一个结果模型。** Animated/Hybrid/FastForward/Step 只改变事件处理与可视化节流，不改变事件顺序或业务语义。FastForward 必须分片让出主线程，不阻塞 UI 也不跳过终止/取消检查。
7. **状态所有权分层。** 资产固有 DES/MaterialFlow 参数位于 GLB/`rv_extras`；放置、连接和实例覆盖位于项目文档；时钟、事件、MU 和占用是内存运行态；快照和实验结果是版本化、项目/文档范围的派生分析产物，不写入库资产。
8. **DES 不再是公开构建的可选私有 seam。** 达到行为平价后，公开组合根直接注册公开 runner，删除 DES 的 `null` stub 和对 `@rv-private/plugins/des/*` 的必需依赖。可选扩展可通过公开注册表增加组件/UI，不得替换公开调度器或注册第二个 DES workspace。
9. **持久契约单独版本化。** rv-ODT v1.1 当前明确排除 DES 插件组件；本决策不静默改写该范围。实施必须建立公开 `DES_RUNTIME` 契约，固定组件字段、单位、快照版本、未知字段和迁移语义。将 DES 纳入 rv-ODT 需要另一个 Accepted ADR。
10. **行业无关性由机器门禁保证。** 新增架构测试阻止 `src/core/material-flow/des/**` 与通用 `src/plugins/des/**` 导入 `PaintLine*`、`DemoPaintLine` 或项目专用插件；验收必须同时包含纯通用流程、普通物料搬运和涂装线三类 fixture。

## Alternatives

- **只在公开构建里做一个涂装线事件循环。** 未采用；会快速得到 Demo，但不能支持装配、包装、物流和仓储，且会制造第二个仿真内核。
- **把完整 DES 都放在 `plugins/des` 并让 core 直接依赖插件。** 未采用；违反核心边界，使确定性、快照与时间推进契约依赖 UI 实现。
- **保留私有 runner，公开层只做 API 包装。** 未采用；公开构建仍然不可运行，不满足用户明确目标。
- **引入第三方 DES 框架。** 未采用；会与已有 `SimulationKernel`、`MaterialFlowDefinition`、Three.js 实体、快照和公开测试契约形成两套模型，同时增加依赖和包体积。
- **继续用 60 Hz 连续 tick 做快进。** 未采用；性能随模拟时长线性增长，无法提供真正的事件跳时、批量复制和精确单步。

## Consequences

正面影响是公开构建获得可复用的 DES 产品基础，涂装线、仓储、物流和装配线可以共用调度、快照、实验和 KPI。现有公开 MaterialFlow 和 UI 骨架能被复用，不需要第二套场景或状态系统。

代价是需要把大量依赖 `@rv-private` 的特征测试迁到公开路径，从测试契约重建缺失实现，并清理可选注入 seam。快进、快照、脚本、实验和主线程分片彼此耦合，必须以黄金切片递增交付，不能用 stub 或只绿一部分私有测试宣称完成。

DES 与连续仿真的切换会触及 RT-1；实施不得改变连续模式已有 Tick 顺序。公开 DES 只是仿真/分析能力，不自动扩大真实 PLC/MQTT 写权限。

## Compatibility and Migration

- 现有无 DES 元数据的 GLB 继续只运行连续仿真；进入 DES 时显示可定位的“没有可运行组件/事件”诊断，不伪造产量。
- 现有 `MaterialFlowDefinition`、稳定端口、`Flow.*` 观测信号和连续行为保持；新 DES 组件契约只加不减。
- 现有私有路径测试必须改为公开导入并从生成排除列表中移出；不得删除、跳过或放宽断言来达到迁移。
- 快照与实验存储必须带版本、模型/项目范围和不匹配诊断；无法安全升级的数据被拒绝或以只读导出呈现，不静默丢弃。
- MQTT/PLC、项目配置优先级、rv-ODT v1.1 和现有涂装线连续行为不迁移。

## Validation

- 纯算法测试覆盖 100k 事件堆排序、取消、容量增长、同时事件稳定序、随机分布和事件风暴保护。
- 契约测试覆盖 MU 守恒、容量/回压、分支/合流、失效/恢复、命名动作和快照等价续跑。
- Kernel/Browser 测试覆盖四种模式等价、切换、暂停、重置、资源释放、快进 UI 响应性和异常可观察性。
- 继承现有所有 DES 特征测试，把 DES 文件从 `private-dependent-tests.json` 排除中彻底移出；生成源与 `tsconfig` 不漂移。
- Playwright 覆盖纯通用、物料搬运和涂装线三个用户流程，以及保存/重开/快照/实验结果。
- 架构测试直接扫描公开 DES 路径，对涂装/Demo/项目私有导入失败关闭。

## Rollback or Supersession

在公开 runner 切换前，每个里程可通过不注册新 factory 回到连续模式；已发布的公开契约不删除。切换后如果出现阻断回归，可由部署功能开关暂时隐藏 DES 工作区，但不得恢复假可用的 `null` runner 或丢弃已写入的快照/实验数据。

未来若替换调度器、改变事件顺序、快照格式、运行态权威或将 DES 组件纳入 rv-ODT，必须以新的 Accepted ADR 和版本化迁移替代或扩展本决策。
