---
doc_id: EP-I18N-001
title: 建立多语言增量治理与黄金切片
status: draft
plan_status: proposed
owner: product
last_reviewed: 2026-08-18
authority: proposed
---

# EP-I18N-001：建立多语言增量治理与黄金切片

## Purpose

先停止新增不可迁移的用户可见文本债务，再由产品和 UX 关闭 OD-002，最后通过一个可切换、可回退、可保存偏好的端到端黄金切片建立正式 i18n 基座。

## Scope

- 盘点用户可见字符串、动态设备文本、可访问名称和错误消息；
- 建立可复现基线、例外登记和“不得新增散落硬编码文本”的增量门禁；
- 形成 OD-002 所需的语言、默认值、回退链、翻译责任和验收输入；
- 决策完成后建立稳定 key、目录、运行时语言状态和一个代表性 Planner/HMI 流程；
- 验证语言切换、缺失翻译回退、刷新恢复、键盘/触摸和布局溢出。

## Non-goals

- 本 Proposed 计划不选择 i18n 框架，也不授权批量替换 UI 字符串；
- 不本地化设备、节点、信号、端口或项目稳定 ID；
- 不把机器翻译结果直接视为 Approved 产品文案；
- 不在黄金切片验证前覆盖全部 Viewer/HMI/Planner/DES。

## Required Documents and Decisions

- `GOV-CONSTITUTION` UI-1/UI-2、`GOV-CHANGE`、`GOV-DOD`；
- KD-001；
- OD-002 必须在运行时架构和批量迁移前关闭；
- 若选择新的长期框架或改变用户偏好状态所有权，需要 Accepted ADR。

## Current Repository Facts

- 当前没有 Approved i18n 产品规格、契约或运行时目录；
- OD-002 阻塞全局契约和批量迁移；
- 现有文本盘点数字必须在计划激活时由脚本重新产生，不从外部评审复制为当前事实。

## State Ownership and Compatibility

语言偏好属于用户/浏览器偏好，不得写成共享项目事实。稳定翻译 key 与英文展示文本解耦；未知或缺失翻译必须回退，不得破坏已保存项目和插件 API。

## Allowed Paths

计划批准后根据盘点和 ADR 收窄；预计包括 i18n 契约、字符串目录、语言状态、一个黄金切片 UI、测试、验收和文档。

## Forbidden Paths

- GLB/rv-ODT 稳定 ID 与设备/节点/信号/端口身份
- 未经 OD-002/ADR 批准的框架和全仓批量替换
- 真实设备与生产接口

## Milestones

1. 只读盘点、分类规则、基线文件、误报/例外模型和增量门禁设计。
2. 产品/UX 关闭 OD-002，必要时接受 ADR 和正式产品规格/契约。
3. 建立目录、语言状态、回退链和一个端到端语言切换黄金切片。
4. 验证保存恢复、缺失 key、布局/可访问性，再按风险分批迁移。

## Progress

- [ ] Owner 评审并决定是否激活计划。

## Surprises & Discoveries

待激活后填写；任何字符串数量和覆盖率必须附可重复命令。

## Decision Log

- 2026-08-18：治理评审只批准建立 Proposed 计划；OD-002 仍为 open，不据此选择实现方案。

## Validation

激活前先定义盘点和误报 fixture；实现阶段至少需要 governance、static、focused Node/Browser、build 和语言切换行为验证。

## Rollback

基线门禁可以回退但不得丢失债务记录；运行时黄金切片必须说明用户偏好和目录的向前/向后兼容方案。

## Outcomes & Retrospective

仅在计划激活并交付后填写；Proposed 状态不代表实现承诺或能力完成。
