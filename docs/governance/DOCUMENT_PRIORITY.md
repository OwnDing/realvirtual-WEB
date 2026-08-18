---
doc_id: GOV-DOC-PRIORITY
title: 文档优先级与冲突处理
status: approved
owner: architecture
last_reviewed: 2026-08-18
authority: normative
---

# 文档优先级与冲突处理

## 1. 权威顺序

用户当前明确指令和运行环境的系统级约束高于仓库文档。在不冲突的前提下，仓库内依据从高到低为：

1. `LICENSE`、安全规则和 [`DEVELOPMENT_CONSTITUTION.md`](DEVELOPMENT_CONSTITUTION.md)；
2. Accepted ADR；
3. 正式版本化 Schema、conformance fixture 和 Approved 契约；
4. Approved 产品规格、架构和领域文档；
5. Accepted/Active ExecPlan 与 Approved 验收文档；
6. 当前代码、测试和运行证据，作为“仓库现在如何工作”的事实；
7. [`LEGACY_DOCUMENT_REGISTER.md`](../LEGACY_DOCUMENT_REGISTER.md) 中的参考文档；
8. README、代码注释、历史快照、外部报告和 Agent 推断。

低优先级内容不得静默覆盖高优先级内容。代码存在只能证明“当前实现如此”，不能自动证明它符合产品意图；反过来，旧 Approved 文档也不能掩盖已经发生的实现漂移。

## 2. 文档状态

- `approved`：可以作为实现依据。
- `draft`：只可用于评审、预演，或用户明确要求实现该草案的任务。
- `reference`：只提供背景和线索，关键结论必须回到更高优先级来源验证。
- `snapshot`：只说明历史时点的事实。
- `superseded`：禁止作为新实现依据。
- `generated`：生成源优先，禁止手改生成区块。

Accepted ADR 必须同时满足 `status: approved` 和 `adr_status: accepted`。可执行 ExecPlan 必须满足 `status: approved` 和 `plan_status: active`。

## 3. 冲突处理

发现会影响实现的冲突时必须：

1. 暂停受冲突影响的实现，不选择最方便的一方；
2. 记录文件、行号、代码/测试/运行证据和影响范围；
3. 在活动 ExecPlan 的 `Surprises & Discoveries` 中登记；
4. 若涉及跨模块、状态所有权、公共契约、安全或不可逆兼容性，创建 ADR 或登记 `OPEN_DECISIONS.md`；
5. 决策后同步更新文档、Schema、测试、代码和生成物；
6. 增加能够阻止同类漂移再次发生的机器门禁。

## 4. 当前过渡规则

- 根目录 `doc-*.md` 保留原路径，由 [`../LEGACY_DOCUMENT_REGISTER.md`](../LEGACY_DOCUMENT_REGISTER.md) 统一登记为参考材料，直至逐份审计并迁入正式目录。
- `schema/v1/rv-odt.json`、`schema/v1/specification.md` 和 conformance fixture 共同构成当前 rv-ODT 正式契约；三者不一致属于阻断性漂移。
- `webviewer.mcp.md` 与 `src/plugins/mcp-bridge/help/*.md` 的生成围栏由 MCP 装饰器生成；围栏外解释文字仍需按普通文档维护。
- `docs/archive/**` 必须是 `superseded`，`docs/references/**` 必须是 `reference`，`docs/generated/**` 必须是 `generated`，`docs/delivery/snapshots/**` 必须是 `snapshot`。
