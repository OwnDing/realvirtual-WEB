---
doc_id: ADR-0003
title: 稳定装配端口身份与 Snap 兼容迁移
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# ADR-0003：稳定装配端口身份与 Snap 兼容迁移

> **Accepted 2026-08-22.** 批准来源：用户在会话中明确同意五项改进并要求“编写 execplan，然后按照计划执行完成”。实施由 Completed [`EP-PLANNER-001`](../exec-plans/completed/EP-PLANNER-001-paintline-assembly-mvp.md) 交付并留证。

## Context

Planner 当前从节点名 `Snap-<方向><流向>-<类型>` 推导连接类型、流向与方向，运行时以 Three.js UUID 作为 Snap 实例 ID。该机制可以驱动既有演示，但节点重命名会改变语义，UUID 又不能跨会话稳定；它不能作为库版本迁移、复杂连接、保存恢复或 AI/MCP 精确选端口的长期契约。

OD-004 要求 product 与 architecture 先确定从 Snap 名称约定演进到稳定端口 ID/约束元数据的兼容方案。本 ADR 在用户明确批准涂装线装配五项实施后关闭该闸口。

## Decision

1. rv-ODT v1 增加可选 `AssemblyPort` 组件。组件写在端口节点的 `extras.realvirtual.AssemblyPort`，包含：
   - `PortId`：资产内部稳定、非空且唯一的语义 ID；
   - `TypeId`：精确匹配的兼容类型；
   - `Flow`：`in | out | bidi`；
   - `Direction`：端口节点局部坐标中的向外单位方向向量。
2. 端口节点仍使用 rv-ODT `NodeId` 表达节点身份。`PortId` 表达装配语义，二者不得互相代替；运行时 UUID 只用于当前会话实例。
3. 新资产在迁移期采用双写：写 `AssemblyPort`，同时保留可被旧解析器识别的 `Snap-*` 节点名。运行时优先读取合法元数据，缺失时回退到既有名称约定。
4. 连接兼容由 `TypeId` 与 `Flow` 决定。`out` 可连 `in`，任一端为 `bidi` 时允许与同类型另一端连接；同流向且均非 `bidi` 不兼容。
5. 布置、搜索、MCP 与保存恢复使用 `PortId` 作为稳定选择器；公开调用继续接受旧 `Snap-*` 节点名，避免破坏既有集成。
6. 本次不把运行时配对关系写进项目 Schema。场景重载后仍按保存的设备位姿重建配对；稳定端口使重建结果可诊断、可寻址。显式连接图如有需要必须另立契约。
7. `PaintLineTrackModule`、`PaintProcessZone` 等领域行为配置继续由运行时 library component schema 管理，不塞进通用 rv-ODT；只有跨领域的 `AssemblyPort` 进入正式格式。

## Alternatives

**继续仅使用节点名。** 未采用。重命名同时改变身份和约束，无法提供稳定迁移边界。

**直接以 `NodeId` 作为端口 ID。** 未采用。`NodeId` 解决节点身份，而同一资产版本间端口语义需要独立、可读且受唯一性约束的键。

**一次性禁止旧 `Snap-*`。** 未采用。会破坏现有 GLB、目录缓存、保存场景和外部插件，违反兼容性契约。

**立即持久化显式连接图。** 未采用。会同时引入项目 Schema、迁移和冲突解决语义，超过初期手工组装涂装线所需的最小闭环。

## Consequences

- 新资产端口可在重命名、重新导出和保存恢复后保持稳定选择；曲线和回转模块不再依赖节点位置猜测向外方向。
- 迁移期需维护元数据与旧名字的一致性，并对重复 `PortId`、非法方向、未知流向给出明确诊断。
- 旧资产零迁移即可继续加载；其稳定性仍受节点名约束，直到资产重新发布为双写格式。
- rv-ODT 次版本从 1.0 提升到 1.1，主版本保持 1；v1.0 文档继续有效。

## Compatibility and Migration

- 读取顺序：合法 `AssemblyPort` → 旧 `Snap-*` 解析 → 非端口节点。
- 新字段均为加法；v1.0 GLB、既有项目和目录无需转换。
- 新涂装线模块全部双写。旧 API 参数 `ownSnapName` 保留，新增 `ownPortId` 优先。
- 删除元数据兼容层前，必须有独立 ADR、资产迁移统计与主版本策略；本 ADR 不授权删除回退。

## Validation

- Schema/规格表同步测试覆盖必填字段、枚举与向量结构。
- Node 测试覆盖元数据优先、旧名字回退、重复 ID、流向兼容和显式方向对齐。
- 目录索引与 Planner/MCP 测试覆盖按 `PortId` 搜索和旧名称调用不回归。
- 涂装线黄金流程覆盖放置、吸附、保存、重新打开后稳定端口仍可定位。

## Rollback or Supersession

运行时可停止生成新元数据并回到旧名称读取，但已经发布的 `AssemblyPort` 字段不得被解释为其他语义。未来替代方案必须通过新 ADR 与 rv-ODT 版本升级，并保持 v1 读取兼容。
