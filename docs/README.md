---
doc_id: DOC-INDEX
title: XYvirtual WEB 文档中心
status: approved
owner: architecture
last_reviewed: 2026-08-18
authority: normative
---

# XYvirtual WEB 文档中心

本目录是项目产品、架构、契约、计划、验收与交付证据的记录系统。AI Agent 和开发者必须先判断文档状态与权威等级，再决定能否用于实现。

## 状态定义

| 状态 | 含义 | 可否作为实现依据 |
| --- | --- | --- |
| `approved` | 已评审生效 | 可以，仍需确认适用于当前任务和版本 |
| `draft` | 提议、讨论或待评审 | 不可以，除非用户明确要求实现该草案 |
| `reference` | 参考资料、旧文档或外部研究 | 不可以直接覆盖 Approved 规则；必须与代码和测试交叉验证 |
| `snapshot` | 某一时点的事实或交付证据 | 只用于追溯，不自动代表当前状态 |
| `superseded` | 已被替代 | 禁止用于新实现 |
| `generated` | 由代码或工具生成 | 以生成源为准，禁止手改生成区块 |

`authority` 与 `status` 是两个维度：前者说明文档承担规范、流程、登记、提议或证据中的哪一种职责，后者说明它是否已生效。完整枚举、Owner 注册表、合法组合和复审告警周期以机器可读的 [`governance/document-metadata-policy.json`](governance/document-metadata-policy.json) 为单一事实源。

## 权威入口

| 类别 | 文档 |
| --- | --- |
| Agent 入口 | [`../AGENTS.md`](../AGENTS.md) |
| 开发宪法 | [`governance/DEVELOPMENT_CONSTITUTION.md`](governance/DEVELOPMENT_CONSTITUTION.md) |
| AI 安全 | [`governance/AI_SAFETY.md`](governance/AI_SAFETY.md) |
| 文档优先级 | [`governance/DOCUMENT_PRIORITY.md`](governance/DOCUMENT_PRIORITY.md) |
| 变更管理 | [`governance/CHANGE_MANAGEMENT.md`](governance/CHANGE_MANAGEMENT.md) |
| 完成定义 | [`governance/DEFINITION_OF_DONE.md`](governance/DEFINITION_OF_DONE.md) |
| Harness | [`governance/HARNESS.md`](governance/HARNESS.md) |
| 当前事实 | [`governance/REPOSITORY_FACTS.md`](governance/REPOSITORY_FACTS.md) |
| 未决事项 | [`governance/OPEN_DECISIONS.md`](governance/OPEN_DECISIONS.md) |
| 旧文档登记 | [`LEGACY_DOCUMENT_REGISTER.md`](LEGACY_DOCUMENT_REGISTER.md) |

## 标准目录

| 目录 | 用途 |
| --- | --- |
| `governance/` | 宪法、AI 安全、优先级、DoD、变更和决策闸口 |
| `product-specs/` | 面向用户行为、范围和非目标的产品规格 |
| `architecture/` | 当前有效的系统、模块、状态所有权和安全架构 |
| `contracts/` | Schema、项目格式、配置、插件、事件和工业接口契约 |
| `adr/` | 架构决策记录 |
| `exec-plans/` | 复杂任务的活动计划、完成计划和技术债 |
| `acceptance/` | 需求到测试、运行证据和性能基线的追踪 |
| `generated/` | 由工具生成的文档 |
| `delivery/snapshots/` | 阶段交付快照，只用于追溯 |
| `references/` | 非规范性研究和外部资料 |
| `archive/` | 已被替代的历史文档 |

## 元数据规则

`docs/**/*.md` 必须使用 YAML front matter，至少包含：

```yaml
---
doc_id: UNIQUE-ID
title: 文档标题
status: approved|draft|reference|snapshot|superseded|generated
owner: product|architecture|engineering|qa|security|maintainers|ux
last_reviewed: YYYY-MM-DD
authority: normative|normative-process|normative-registry|proposed|reference|snapshot|generated
---
```

## 使用规则

1. 新文档必须有唯一 `doc_id`，并加入对应目录索引。
2. Draft 不会因为代码已经照着实现而自动成为 Approved。
3. 文档与代码不一致时，按文档优先级处理并登记证据；禁止静默改一边。
4. `references`、`snapshots`、`archive` 不得作为活动 ExecPlan 的唯一依据。
5. 移动或重命名文档必须同步链接、代码注释、索引和登记表。
6. 根目录旧技术文档在迁移前由 [`LEGACY_DOCUMENT_REGISTER.md`](LEGACY_DOCUMENT_REGISTER.md) 管理，不强行一次性重写。
7. 运行 `./scripts/verify.sh governance` 检查元数据、唯一 ID、目录索引、链接、计划状态、旧文档登记和危险 AI 命令。
8. `approved` 文档超过策略中的复审周期只产生显式 warning，不会仅因时间自动失效；Owner 必须结合语义漂移决定复审、降级或替代。
