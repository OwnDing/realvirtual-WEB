---
doc_id: GOV-OPEN-DECISIONS
title: 当前未决事项与实施闸口
status: approved
owner: architecture
last_reviewed: 2026-08-18
authority: normative-registry
---

# 当前未决事项与实施闸口

本文件只登记“谁必须决定什么、阻塞什么”，不替代 ADR、产品规格或契约。Agent 不得自行关闭下列事项。

| ID | 决策 | Owner | 阻塞范围 | 状态 |
| --- | --- | --- | --- | --- |
| OD-001 | 平台边界是浏览器/本地优先，还是包含账户、组织、权限、云端资产与审计服务 | product、architecture | 新服务端、租户/组织模型、云端项目后端 | open |
| OD-002 | 首批正式语言、默认语言、回退链和翻译责任 | product、ux | 全局 i18n 契约和批量 UI 迁移 | open |
| OD-003 | 部署、项目、文档、模型、用户和会话配置的可覆盖字段及优先级 | product、architecture | 统一配置 Schema、编辑 UI 和迁移 | open |
| OD-004 | Snap 名称约定向稳定端口 ID/约束元数据演进的兼容方案 | product、architecture | 新装配 Schema、复杂连接与库资产迁移 | open |
| OD-005 | 新 Quality Gates 在远程 CI 的必需检查名称和分支保护策略 | maintainers | 把 CI configured 状态升级为 enforced | open |
| OD-006 | 根目录 22 份 `doc-*.md` 的逐份审计、迁移和 Approved 清单 | architecture、engineering | 将旧文档从 reference 提升为正式依据 | open |

## 执行规则

1. 任务碰到阻塞范围时，ExecPlan 必须引用对应 OD。
2. 决策完成后创建或更新 ADR/产品规格/契约，再把状态改为 `closed`。
3. 关闭记录必须包含日期、批准人或批准来源、落地文档和需要同步的代码/测试。
4. 未触及阻塞范围的工作可以继续，不能把“有未决事项”当成无限暂停理由。

## 决策落地记录

当前尚无关闭记录。
