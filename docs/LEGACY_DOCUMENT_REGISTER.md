---
doc_id: DOC-LEGACY-REGISTER
title: 根目录现有技术文档登记表
status: approved
owner: architecture
last_reviewed: 2026-08-18
authority: normative-registry
---

# 根目录现有技术文档登记表

本表让治理体系可以渐进落地，而不是通过一次大搬迁制造大量断链。下列文档保留原路径；除明确注明 `generated` 外，当前统一视为 `reference`：它们是重要技术证据，但尚未逐份完成“文档—代码—测试”审计，不能覆盖 Approved 治理、正式 Schema、Accepted ADR 或当前代码事实。

使用规则：

1. 任务开始前根据本表选择相关文档；
2. 实现前验证关键结论对应的代码和测试；
3. 发现漂移时写入活动 ExecPlan；
4. 完成专项审计后，可将文档迁入正式目录、增加元数据并从本表移除；
5. `webviewer.mcp.md` 的生成区块以 MCP 装饰器和生成脚本为准。

| 文档 | 当前状态 | 主要主题 |
| --- | --- | --- |
| [`doc-ai-integration.md`](../doc-ai-integration.md) | reference | AI/MCP 架构、连接与安全边界 |
| [`doc-behavior-modelling.md`](../doc-behavior-modelling.md) | reference | 连续仿真与 DES 建模 |
| [`doc-behaviors.md`](../doc-behaviors.md) | reference | TypeScript 行为组件 |
| [`doc-deploy.md`](../doc-deploy.md) | reference | 构建、部署和发布 |
| [`doc-document-linking.md`](../doc-document-linking.md) | reference | PDF/AASX 与节点文档关联 |
| [`doc-events-and-hooks.md`](../doc-events-and-hooks.md) | reference | 事件、Hook 与生命周期 |
| [`doc-extending-webviewer.md`](../doc-extending-webviewer.md) | reference | 插件、UI Slot 和扩展方式 |
| [`doc-layout-planner.md`](../doc-layout-planner.md) | reference | 设备库、拖拽、吸附、装配与持久化 |
| [`doc-lifecycle.md`](../doc-lifecycle.md) | reference | Viewer、模型和插件生命周期 |
| [`doc-multiuser-system.md`](../doc-multiuser-system.md) | reference | 多用户会话与同步 |
| [`doc-node-paths.md`](../doc-node-paths.md) | reference | 路径、NodeId、引用和解析 |
| [`doc-path-fleet-control.md`](../doc-path-fleet-control.md) | reference | AGV/FTS 路径和车队控制 |
| [`doc-persistence.md`](../doc-persistence.md) | reference | 项目、文档、操作日志和存储 |
| [`doc-plc-programming.md`](../doc-plc-programming.md) | reference | 虚拟 PLC 与 ST |
| [`doc-scripting.md`](../doc-scripting.md) | reference | GLB 内脚本和 QuickJS |
| [`doc-signal-architecture.md`](../doc-signal-architecture.md) | reference | 信号总线、方向、绑定和接口 |
| [`doc-signal-connection-logic.md`](../doc-signal-connection-logic.md) | reference | 信号拖拽连接规则 |
| [`doc-ui-visibility.md`](../doc-ui-visibility.md) | reference | 插件参与模式与 UI 可见性 |
| [`doc-unity-to-web.md`](../doc-unity-to-web.md) | reference | Unity 到 WEB 的职责与工作流 |
| [`doc-web-debugging.md`](../doc-web-debugging.md) | reference | 调试、日志、HTTP API 和 E2E |
| [`doc-webviewer-interface.md`](../doc-webviewer-interface.md) | reference | WebSocket、MQTT、ctrlX 等工业接口 |
| [`doc-webviewer.md`](../doc-webviewer.md) | reference | 总体架构和功能百科 |
| [`webviewer.mcp.md`](../webviewer.mcp.md) | generated-mixed | MCP 工具参考；生成围栏禁止手改 |
