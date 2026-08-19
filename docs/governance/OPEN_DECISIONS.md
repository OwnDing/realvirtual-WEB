---
doc_id: GOV-OPEN-DECISIONS
title: 当前未决事项与实施闸口
status: approved
owner: architecture
last_reviewed: 2026-08-19
authority: normative-registry
---

# 当前未决事项与实施闸口

本文件只登记“谁必须决定什么、阻塞什么”，不替代 ADR、产品规格或契约。Agent 不得自行关闭下列事项。

| ID | 决策 | Owner | 阻塞范围 | 状态 |
| --- | --- | --- | --- | --- |
| OD-001 | 平台边界是浏览器/本地优先，还是包含账户、组织、权限、云端资产与审计服务 | product、architecture | 新服务端、租户/组织模型、云端项目后端 | open |
| OD-002 | 首批 `zh-CN`/`en-US`、默认与最终回退中文、AI 直接翻译、locale 格式化范围 | product、ux | 已落入 `PS-I18N-001`；运行时架构仍需 ADR 和 Active ExecPlan | closed |
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

- 2026-08-19，用户当前明确指令确认 OD-002 的部分产品输入：首批正式语言为中文、英文，默认语言为中文。
- 2026-08-19，用户确认进入下一步并明确翻译直接由 AI 完成；结合上一轮待确认方案，规范 locale 为 `zh-CN`/`en-US`，回退链为当前语言 → `zh-CN` → 稳定 key 与诊断，日期和数字随当前 locale，工业单位和稳定 ID 不本地化。
- OD-002 于 2026-08-19 关闭。批准来源为用户当前明确指令，落地文档为 Approved [`PS-I18N-001`](../product-specs/MULTILINGUAL_LOCALIZATION.md)；运行时框架、目录、偏好存储和测试由 Proposed `ADR-0001` 与 `EP-I18N-001` 继续约束，不把产品决策关闭解释为代码已经实现。
