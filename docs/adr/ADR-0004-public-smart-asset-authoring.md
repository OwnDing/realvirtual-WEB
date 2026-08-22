---
doc_id: ADR-0004
title: 公开智能资产编辑复用统一文档与 rv-ODT
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# ADR-0004：公开智能资产编辑复用统一文档与 rv-ODT

## Context

仓库已经公开提供 `AssetDocument`、资产操作执行器、GLB 导出、草稿、统一保存、组件 Schema/Inspector、统一导入和 Library 刷新能力，但公开组合根没有注册 `asset-editor` 插件和 `editor` 工作区，导致这些能力无法由用户形成闭环。项目此前把完整 UI 放在可选私有适配器中；用户现明确确认本项目无许可限制并要求在开源项目中完整实现智能资产编辑。

本次决定涉及公开/可选模块边界、编辑状态所有权和持久化写入路径，需用 ADR 固定，避免为了补 UI 再造第二套文档、资产 Schema 或保存方式。

## Decision

1. 在公开 `src/plugins/smart-asset-editor/` 实现并注册唯一插件 ID `asset-editor`，由公开组合根注册 `editor` detached 工作区。
2. 所有持久编辑只通过现有 `AssetDocument` 与统一 `RvOp` 词汇；GLB 导入复用 `importIntoAsset()`/`importCad` 的内容哈希缓存语义，不新增操作类型。
3. 资产内在事实写入 GLB 的 `rv_extras`；智能模板仅组合已有 rv-ODT 组件和已批准领域扩展。项目放置及覆盖继续由项目文档拥有。
4. 保存和另存为只调用 `saveDocument()`，保留目标绑定、单写者、CAS 冲突和原路径语义；成功后显式重扫项目文档并刷新项目 Library。
5. 项目面板与 MCP 的“待打开资产”交接迁到公开 core store，避免公开入口继续指向无操作的私有 stub。可选私有功能仍可扩展公开 Editor，但不得注册第二个 `asset-editor` 或第二个 Editor mode。
6. 发布校验是确定性的纯读分析，不修写用户数据；错误阻断保存按钮的“发布”动作，普通草稿自动保存机制不变。
7. MQTT、PLC、WebSocket、MCP 工业写权限及接口语义不在本决策范围内，不得随 Editor 改动。

## Alternatives

- 把现有私有 UI 整体视为外部依赖：公开构建仍不可用，不能满足用户目标。
- 新建“智能资产 JSON”并在发布时转换：形成第二状态权威，破坏 GLB/`rv_extras` 契约。
- 直接修改 Three.js 场景而不记录操作：无法可靠撤销、重放和草稿恢复。
- 继续调用旧 `saveAssetToCustomLibrary()`：绕过统一保存的 CAS 和原路径路由，不符合现行持久化契约。

## Consequences

正面影响是公开构建获得完整、可测试的资产制作闭环，且 Planner、Inspector、MCP 和保存链路共享同一文档。代价是组合根与此前“Editor 只由私有适配器注册”的约定改变；私有扩展若存在必须变成能力扩展而不是重复注册。

首版智能模板是结构化向导，不承诺自动理解任意 CAD；用户仍需确认端口位置、方向和行为参数。发布校验不代替真实设备、动力学或工艺验证。

## Compatibility and Migration

不更改 GLB、rv-ODT、`RvOp`、项目文档或 MQTT Schema。新端口遵循 ADR-0003 双写，旧资产继续按原逻辑读取。已有草稿和保存资产不迁移；公开 pending-open store 只承载会话内交接，不持久化。

## Validation

- 纯函数测试覆盖端口/信号/模板生成和正反校验；
- 插件测试覆盖 Editor mode 注册、激活/释放、EditTarget 和统一导入；
- 保存测试覆盖统一保存结果、项目重扫和 Library 刷新；
- 浏览器黄金流程覆盖创建资产、增加端口/信号、校验、保存和 Planner Library 可见；
- `./scripts/verify.sh governance|static|node|browser|build` 按环境记录真实结果。

## Rollback or Supersession

公开插件、mode 注册和 core pending-open store 可整体移除；既有核心、保存数据和资产无需回滚。未来替换本决策必须仍保证单一 `AssetDocument`、单一 GLB/`rv_extras` 权威和统一保存/CAS，或用新的 Accepted ADR 明确迁移方案。
