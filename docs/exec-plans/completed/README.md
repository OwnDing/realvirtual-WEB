---
doc_id: EXEC-COMPLETED-INDEX
title: 已完成 ExecPlan 索引
status: approved
owner: engineering
last_reviewed: 2026-09-02
authority: normative-registry
---

# 已完成 ExecPlan 索引

- [`EP-GOV-001-document-governance-foundation.md`](EP-GOV-001-document-governance-foundation.md)：建立文档优先、AI 安全、ExecPlan/ADR、Harness 与 CI 基座。
- [`EP-GOV-002-governance-hardening.md`](EP-GOV-002-governance-hardening.md)：加固元数据/索引/计划状态、安全指令与 Quality Gates 证据闭环。
- [`EP-GOV-003-browser-gate-baseline.md`](EP-GOV-003-browser-gate-baseline.md)：修复 Browser Gate 超时、CI 输入缺口与公共浏览器测试基线，并完成远程 Actions 验证。
- [`EP-I18N-001-incremental-foundation.md`](EP-I18N-001-incremental-foundation.md)：交付中英双语运行时、静态目录、偏好与回退、全界面增量迁移和零散落文案门禁，并关闭 KD-001。
- [`EP-DEMO-001-paintline-demo.md`](EP-DEMO-001-paintline-demo.md)：连续输送式涂装线演示场景黄金切片，2026-08-22 完成；遗留的核心分类缺陷移交 `EP-CONV-001`。
- [`EP-CONV-001-overhead-conveyor-accumulation.md`](EP-CONV-001-overhead-conveyor-accumulation.md)：按 Accepted `ADR-0002` 实现悬挂链积放模式与放行闸，并建成涂装线蛇形积放缓冲段；2026-08-22 完成。

- [`EP-DEMO-002-paintline-robot-kpi.md`](EP-DEMO-002-paintline-robot-kpi.md)：涂装线的实测节拍/产量 KPI 与喷房六轴机器人；2026-08-22 完成。

- [`EP-DEMO-003-paintline-fanuc-robot.md`](EP-DEMO-003-paintline-fanuc-robot.md)：把 default demo 的 FANUC CRX 提取为库对象并换装进涂装线喷房；2026-08-22 完成。

- [`EP-DEMO-004-paintline-spray-aim.md`](EP-DEMO-004-paintline-spray-aim.md)：恢复喷幅、放大机械臂，并修复提取器搬运捐赠站位导致的喷枪指向错误；2026-08-22 完成。

- [`EP-PLANNER-001-paintline-assembly-mvp.md`](EP-PLANNER-001-paintline-assembly-mvp.md)：交付 Library 开箱可见、rv-ODT 1.1 稳定端口、16 项涂装线模块、数据驱动闭环行为与 autosave 冷重建黄金流程；2026-08-22 完成，保留本机 SwiftShader 全量 Browser 偏差。
- [`EP-ASSET-001-smart-asset-editor.md`](EP-ASSET-001-smart-asset-editor.md)：交付公开智能资产编辑器；新建/打开/导入、端口/行为/信号向导、发布校验、统一保存与 Project Library 即时复用；2026-08-22 完成，并留证 LFS 夹具与 SwiftShader Browser 偏差。
- [`EP-DES-001-public-domain-neutral-des.md`](EP-DES-001-public-domain-neutral-des.md)：交付公开、行业无关的确定性 DES 内核、通用 MaterialFlow 组件、稳定拓扑、四运行模式、诊断/KPI、快照/实验/批处理与 Planner 保存重开黄金流程；2026-08-22 完成，并留证 LFS 夹具与 SwiftShader Browser 偏差。

- [`EP-DES-002-public-des-hardening.md`](EP-DES-002-public-des-hardening.md)：修复公开 DES 的快照恢复原子性与动作预注册、显式 `routeIndex` 被下游满载改道、运行时生命周期泄漏、稳定端口在缩放父链下的方向取值，并收敛每帧/取消/自动连接等热点；同时把只处理 1 个事件的机器人上下料参考负载改为真实事件流并更正 `EP-DES-001` 的浏览器证据行；2026-08-23 完成。

- [`EP-UI-001-hmi-layout-regressions.md`](EP-UI-001-hmi-layout-regressions.md)：修复告警收回操作区、全屏 3D 画布与 HMI 顶部 KPI 看板回归，并完成真实 Chromium、两轮本地全量与最终实现提交远程三轮门禁验收；2026-08-25 完成。
- [`EP-CONFIG-001-deployment-identity-egress.md`](EP-CONFIG-001-deployment-identity-egress.md)：交付版本化部署身份、默认拒绝外呼、origin/purpose allowlist、本地 QR/Draco/Teams SDK、构建 CSP 与静态/浏览器反退化门禁；2026-08-25 完成。
- [`EP-LICENSE-001-offline-license.md`](EP-LICENSE-001-offline-license.md)：交付自有离线许可证、Ed25519 信任根与签发 CLI、到期只读降级、CONNECT 上游授权客户端移除和合同到期行为说明；2026-08-28 完成。
- [`EP-CONFIG-002-unified-configuration.md`](EP-CONFIG-002-unified-configuration.md)：交付 Deployment v2、项目/用户/会话分层 resolver、locale/workspace/feature 策略、旧 settings 无污染 overlay 与可配置客户交付生成；2026-08-29 完成。

完成计划是历史证据，不自动代表当前代码状态；复用结论前检查其日期、验证范围和后续变更。
