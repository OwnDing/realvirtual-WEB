---
doc_id: CONTRACT-DES-RUNTIME-001
title: DES 公开运行时与快照契约
status: approved
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# DES 公开运行时与快照契约

## 1. 范围与版本

本契约固定公开、行业无关 DES 的运行时边界。事件内核位于 `src/core/material-flow/des/`，场景、MaterialFlow、Viewer 与 UI 适配位于 `src/plugins/des/`。涂装、焊装、仓储等行业插件只能通过公开组件定义和稳定端口消费该能力，不能替换调度器。

当前运行时契约版本为 **1**，当前完整快照版本为 **3**。rv-ODT v1.1 仍不包含 DES 插件组件；资产内 DES/MaterialFlow 参数继续作为 `rv_extras` 的扩展字段保存，不能据本契约宣称其已成为 rv-ODT 字段。

## 2. 状态所有权

| 状态 | 权威所有者 | 持久化规则 |
| --- | --- | --- |
| 组件类型、参数、稳定端口 | Library GLB/`rv_extras` | 保留未知字段，不由运行器回写 |
| 放置、显式连接、实例覆盖 | 项目文档/`RvOp` | 走统一项目保存链路 |
| 仿真时钟、事件、MU、占用、预约、tween | 单个 DES runner | 普通项目保存不写入 GLB |
| 快照、checkpoint、实验与运行历史 | 项目/文档范围派生产物 | 带版本、模型范围和失败诊断 |

## 3. 时间、单位与排序

- 仿真时间、延迟、MTBF、MTTR 和处理时间均为有限的非负秒；不得调度到当前仿真时间之前。
- 资产几何遵循平台现有单位；MaterialFlow 的 `speed` 字段按各组件 Schema 声明。`PathTransport.speed` 与 `IndexingConveyor.speed` 为 mm/s，路径长度在运行时换算为米。
- 事件严格按 `(time ASC, priority DESC, sequence/id ASC)` 出队。同时间同优先级保持创建顺序。
- 事件只引用稳定命名动作；持久状态不得包含闭包、函数、DOM、Three.js 对象或活动句柄。
- 相同模型、参数、终止条件和主种子必须产生相同事件顺序、业务终态与 KPI。Animated、Hybrid、FastForward 只改变渲染/分片策略；Step 每次最多处理一个模型事件。
- 非法时间、非有限参数、未知动作和事件风暴必须抛出可定位错误，不得静默修正为演示结果。

## 4. MU、容量、拓扑与交接

- MU 的持久身份是 `{id, gen}`；槽位回收会增加 `gen`，旧引用不得重新指向新实体。
- 父子/载具关系以 `childMUs`、`parentMU` 的 `MuRef` 为权威；`runtimeChildren` 仅为运行时投影。
- 容量由 `currentLoad + reservedLoad <= MaxCapacity` 约束。多 MU 交接必须先预约并原子提交；任何部分失败都完整回滚。
- 已配对稳定端口和显式逻辑连接优先于距离自动连接。输出端口只能连接兼容输入；没有目标、满容量和故障目标必须形成可观察阻塞或诊断。
- `canAccept`/`onDownstreamReady` 是 DES 回压权威。`Flow.*` 信号继续服务连续仿真与工业观测，不能替代确定性交接。
- Sink 在接受后立即释放逻辑容量并统计产出；视觉销毁可延迟到安全渲染阶段，但不能造成线尾死锁。

## 5. 故障、视觉与生命周期

- 公开组合根同步注册一个轻量 runner facade；实际 DES 运行模块在首次进入 DES 时按需加载。`SimDesControl.ready` 在真实 runner 完成创建和 `start()` 前为 `false`，加载完成后为 `true`。加载窗口内 tick 不推进事件，异步实验操作等待加载，快速切回连续模式必须取消待启动场景，不能在后台启动已放弃的仿真。
- 在途或处理中故障会保存剩余时间并暂停所属事件/tween；维修后按剩余时间恢复。RobotHandling 可按安全阶段完成已开始的原子循环，再进入 Failure。
- FastForward 不写中间视觉变换；退出时按仿真时间物化/对齐 WIP 并重新连接活动 tween。缺失模板必须返回明确原因或使用标记过的通用 gizmo，不能伪装成真实资产。
- 模型加载、模式切换、Reset、`clearMUs`、插件停用和 dispose 必须清理事件、预约、tween、轴所有权、订阅与视觉资源。模式切换不得改变连续 Tick 的既有顺序。

## 6. 快照 v3

完整快照至少包含：`version`、`simTime`、`duration`、`totalEventsProcessed`、`masterSeed`、`eventQueue`、`components`、`mus`、`rngStates`、`signals`；可包含 `scriptStates`、`tweens`、统计基线、MU 代次计数、预约和下一个预约 ID。

- 写出版本固定为 v3；v1/v2 通过显式迁移补齐缺省字段后读取。
- 未知顶层和组件 `prop` 字段必须保留；未知组件路径记录警告并跳过该组件状态，不得绑定到名字相似的对象。
- 未知快照版本、未知命名动作、失效 `MuRef`、非 JSON 状态或无法安全迁移的数据失败关闭。
- JavaScript 的 `Infinity` 经 JSON 变为 `null`；`duration: null` 在读取时唯一解释为无界运行，不得解释为零时长。
- 恢复顺序为：验证/迁移 → manager/MU/组件与代次 → 预约 → 事件队列 → tween/脚本 → 可视化重建与 `onRestore`。快照恢复续跑必须等价于不中断运行。

## 7. 实验与存储

- 实验以项目/模型/实验/复制为作用域；主种子和复制派生种子必须记录。
- 参数覆盖只允许已声明的标量字段；脚本接口为受限 setter，不允许任意代码或外部写入。
- 批量取消保留已完成复制，并将未完成运行标记为 aborted；配额、导入、模型哈希不匹配和损坏记录必须可观察。
- CSV/JSON/NDJSON 导出是分析副本，不回写 Library 资产，也不扩大 PLC/MQTT 写权限。

## 8. 兼容与行业边界

无 DES 元数据的旧 GLB 和项目继续以连续模式运行；DES 模式对空模型显示真实空队列/诊断。公共 DES 路径禁止导入 `PaintLine*`、`DemoPaintLine`、项目专用或私有 DES 模块。新增字段遵循只加不减；改变事件排序、状态权威、快照版本或 rv-ODT 范围必须由新的 Accepted ADR 和迁移方案批准。
