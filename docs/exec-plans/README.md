---
doc_id: EXEC-INDEX
title: ExecPlan 使用规范
status: approved
owner: engineering
last_reviewed: 2026-08-18
authority: normative-process
---

# ExecPlan 使用规范

- 尚未批准的计划放在 [`proposed/`](proposed/)，使用 `status: draft, plan_status: proposed`。
- 已批准的活动计划放在 [`active/`](active/)，命名 `EP-<AREA>-<NNN>-<slug>.md`。
- 完成后补齐 Outcomes 与证据，再移动到 [`completed/`](completed/)。
- 计划必须自包含，使新 Agent 不依赖聊天记录也能继续执行。
- Progress、Surprises & Discoveries、Decision Log、Validation 在实施中持续更新。
- 计划不得自行批准被 `OPEN_DECISIONS.md` 阻塞的产品或架构决策。
- 计划中的“通过”必须带实际命令或运行证据，不能写预期结果。

起草时使用 `status: draft, plan_status: proposed`；批准执行后移动到 `active/`，使用 `status: approved, plan_status: active`；完成后补齐证据并移动到 `completed/`，保留 `status: approved` 并改为 `plan_status: completed`。ExecPlan 根目录只允许索引和模板。

模板见 [`TEMPLATE.md`](TEMPLATE.md)。
