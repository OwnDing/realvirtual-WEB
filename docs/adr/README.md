---
doc_id: ADR-INDEX
title: 架构决策记录
status: approved
owner: architecture
last_reviewed: 2026-08-22
authority: normative-process
---

# 架构决策记录

ADR 用于记录会长期影响多个模块、状态所有权、安全边界或不可逆契约的决策。编号采用 `ADR-0001-short-title.md`。

`adr_status` 使用 `proposed`、`accepted`、`rejected`、`superseded`。提议阶段文档为 `status: draft`；接受后改为 `status: approved, adr_status: accepted`。只有 Accepted ADR 具有规范效力。

- [`ADR-0001-i18n-runtime.md`](ADR-0001-i18n-runtime.md)：Accepted（2026-08-19），选择多语言运行时、静态目录、偏好存储与回退边界。
- [`ADR-0002-overhead-conveyor-accumulation.md`](ADR-0002-overhead-conveyor-accumulation.md)：Accepted（2026-08-22），悬挂链积放（power-and-free）的状态模型——按载具行进者取代单一链相位标量，作为可选模式。
- [`ADR-0003-stable-assembly-ports.md`](ADR-0003-stable-assembly-ports.md)：Accepted（2026-08-22），稳定 `AssemblyPort` 身份、方向与旧 `Snap-*` 双写兼容迁移。
- [`ADR-0004-public-smart-asset-authoring.md`](ADR-0004-public-smart-asset-authoring.md)：Accepted（2026-08-22），公开智能资产编辑复用统一文档、GLB/`rv_extras` 权威与统一保存链路。
- [`ADR-0005-public-domain-neutral-des.md`](ADR-0005-public-domain-neutral-des.md)：Accepted（2026-08-22），公开 DES 采用行业无关内核、宿主/UI 适配层和可注册 MaterialFlow 扩展。

`ADR-0001` 至 `ADR-0005` 均为 Accepted。`ADR-0001` 的实施已由 Completed [`EP-I18N-001`](../exec-plans/completed/EP-I18N-001-incremental-foundation.md) 交付并留证；`ADR-0002` 的实施已由 Completed [`EP-CONV-001`](../exec-plans/completed/EP-CONV-001-overhead-conveyor-accumulation.md) 交付并留证；`ADR-0003` 的实施已由 Completed [`EP-PLANNER-001`](../exec-plans/completed/EP-PLANNER-001-paintline-assembly-mvp.md) 交付并留证；`ADR-0004` 的实施已由 Completed [`EP-ASSET-001`](../exec-plans/completed/EP-ASSET-001-smart-asset-editor.md) 交付并留证；`ADR-0005` 的实施已由 Completed [`EP-DES-001`](../exec-plans/completed/EP-DES-001-public-domain-neutral-des.md) 交付并留证。ADR 本身不单独授权执行计划范围外的全仓迁移。创建场景见 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。
