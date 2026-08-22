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

`ADR-0001` 与 `ADR-0002` 均为 Accepted。`ADR-0001` 的实施已由 Completed [`EP-I18N-001`](../exec-plans/completed/EP-I18N-001-incremental-foundation.md) 交付并留证，ADR 本身仍不单独授权新的全仓迁移；`ADR-0002` 的实施已由 Completed [`EP-CONV-001`](../exec-plans/completed/EP-CONV-001-overhead-conveyor-accumulation.md) 交付并留证。创建场景见 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。
