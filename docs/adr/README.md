---
doc_id: ADR-INDEX
title: 架构决策记录
status: approved
owner: architecture
last_reviewed: 2026-08-19
authority: normative-process
---

# 架构决策记录

ADR 用于记录会长期影响多个模块、状态所有权、安全边界或不可逆契约的决策。编号采用 `ADR-0001-short-title.md`。

`adr_status` 使用 `proposed`、`accepted`、`rejected`、`superseded`。提议阶段文档为 `status: draft`；接受后改为 `status: approved, adr_status: accepted`。只有 Accepted ADR 具有规范效力。

- [`ADR-0001-i18n-runtime.md`](ADR-0001-i18n-runtime.md)：Proposed，选择多语言运行时、静态目录、偏好存储与回退边界。

当前没有 Accepted ADR。创建场景见 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。
