---
doc_id: EP-I18N-001
title: 建立多语言增量治理与黄金切片
status: draft
plan_status: proposed
owner: product
last_reviewed: 2026-08-19
authority: proposed
---

# EP-I18N-001：建立多语言增量治理与黄金切片

## Purpose

先停止新增不可迁移的用户可见文本债务，在已关闭 OD-002 和 Approved `PS-I18N-001` 基础上接受运行时 ADR，最后通过一个可切换、可回退、可保存偏好的端到端黄金切片建立正式 i18n 基座。

## Scope

- 盘点用户可见字符串、动态设备文本、可访问名称和错误消息；
- 建立可复现基线、例外登记和“不得新增散落硬编码文本”的增量门禁；
- 落实 `zh-CN`/`en-US`、默认中文、中文最终回退、AI 直接翻译和 locale 格式化规则；
- 决策完成后建立稳定 key、目录、运行时语言状态和一个代表性 Planner/HMI 流程；
- 验证语言切换、缺失翻译回退、刷新恢复、键盘/触摸和布局溢出。

## Non-goals

- 本 Proposed 计划通过 ADR 评审 i18n 框架，在 ADR 接受和计划激活前不授权安装依赖或批量替换 UI 字符串；
- 不本地化设备、节点、信号、端口或项目稳定 ID；
- 不在浏览器运行时调用 AI；AI 直接翻译的静态目录仍必须通过机器门禁和黄金切片；
- 不在黄金切片验证前覆盖全部 Viewer/HMI/Planner/DES。

## Required Documents and Decisions

- `GOV-CONSTITUTION` UI-1/UI-2、`GOV-CHANGE`、`GOV-DOD`；
- KD-001；
- OD-002 已关闭，Approved `PS-I18N-001` 是产品行为依据；
- 新的长期框架需要 Accepted `ADR-0001`；改变用户偏好状态所有权需要另行 Accepted ADR。

## Current Repository Facts

- `PS-I18N-001` 已批准，OD-002 已关闭；当前仍没有正式 i18n 契约、运行时目录或语言切换实现；
- 现有文本盘点数字必须在计划激活时由脚本重新产生，不从外部评审复制为当前事实。
- `src/plugins/snap-point/strings.ts` 存在仅含英文的轻量字符串表，但不是正式全局 i18n 运行时或 Approved 契约。
- 2026-08-19 现场查询：项目使用 React 19.2、TypeScript 5.7；仓库没有 i18next、React Intl 或 Lingui 依赖。

## State Ownership and Compatibility

语言偏好属于用户/浏览器偏好，不得写成共享项目事实。稳定翻译 key 与中英文展示文本解耦；未知或缺失翻译必须回退，不得破坏已保存项目和插件 API。

## Allowed Paths

计划批准后根据盘点和 ADR 收窄；预计包括 i18n 契约、字符串目录、语言状态、一个黄金切片 UI、测试、验收和文档。

## Forbidden Paths

- GLB/rv-ODT 稳定 ID 与设备/节点/信号/端口身份
- 未经 Accepted ADR 和 Active ExecPlan 授权的框架安装与全仓批量替换
- 真实设备与生产接口

## Milestones

1. 只读盘点、分类规则、基线文件、误报/例外模型和增量门禁设计。
2. 产品/UX 已关闭 OD-002 并批准产品规格；架构评审并接受 i18n 运行时 ADR。
3. 建立目录、语言状态、回退链和一个端到端语言切换黄金切片；保持现有公开插件 `label` 契约向后兼容，并覆盖一个非 React 注册标签、一个 CanvasTexture 标签、pre-boot/`<html lang>`、一个独立 Root，以及代表性的 `Intl`/MUI 文案面。
4. 验证保存恢复、缺失 key、布局/可访问性，再按风险分批迁移其余 Root、`Intl`/MUI、CanvasTexture 和用户可见文本。

## Progress

- [x] 产品确认首批语言为中文、英文，默认语言为中文。
- [x] 产品确认 `zh-CN`/`en-US`、中文最终回退、AI 直接翻译和 locale 格式范围，关闭 OD-002。
- [ ] 架构 Owner 评审并接受 `ADR-0001`。
- [ ] Owner 评审并决定是否激活计划。

## Surprises & Discoveries

待激活后填写；任何字符串数量和覆盖率必须附可重复命令。

## Decision Log

- 2026-08-18：治理评审只批准建立 Proposed 计划；OD-002 仍为 open，不据此选择实现方案。
- 2026-08-19：用户当前明确指令确认首批语言为中文、英文，默认语言为中文；计划仍保持 Proposed，未选择 locale 标识、回退链、翻译责任或 i18n 框架。
- 2026-08-19：用户明确由 AI 直接完成翻译并确认进入下一步；采用 `zh-CN`/`en-US`、中文最终回退和 locale 格式化方案，OD-002 关闭，建立 Proposed `ADR-0001` 评审运行时框架。
- 2026-08-19：吸收外部评审中关于首次目录迁移、非 React/Canvas 传播、pre-boot、多个 Root、测试 locale、包体积和 CJK 字体的候选设计；修正异步分包与同步启动冲突，保留公开插件 `label` 契约兼容，并把全量盘点移到后续增量里程碑。该评审不构成 ADR 接受或计划激活。

## Reproducible Inventory

计划激活时先用下列只读命令定位候选面；命令输出只用于发现，不直接作为用户可见字符串总数或完成率：

```bash
rg -l -P '[\x{4e00}-\x{9fff}]' src --glob '*.{ts,tsx,js,jsx,json,html,css}'
rg -n 'ctx\.fillText|\.fillText\(' src --glob '*.{ts,tsx}'
rg -n 'Intl\.|toLocale[A-Za-z]*\(' src --glob '*.{ts,tsx}'
rg -n "['\"]en-US['\"]" src --glob '*.{ts,tsx}'
```

Milestone 1 必须再建立版本化盘点脚本和 fixture，按 React 文案、插件/注册表、CanvasTexture、pre-boot、`Intl`/MUI、可访问名称、动态设备文本与误报例外输出机器可读基线。只有脚本命令、版本和忽略理由一同入库的数字才可写入验收记录；后续迁移必须由同一脚本重算。

## Validation

激活前先定义盘点脚本、分类规则和误报 fixture；实现阶段至少需要 governance、static、focused Node/Browser、build、入口包体积和语言切换行为验证。黄金切片的测试装置必须显式 pin locale，并验证公开插件 `label` 的既有字符串与函数/getter 形式兼容、同步初始化/离线切换、非 React 标签、CanvasTexture 重建、pre-boot/`<html lang>` 与一个独立 Root；全量盘点项不作为第一阶段完成条件。

## Rollback

基线门禁可以回退但不得丢失债务记录；运行时黄金切片必须说明用户偏好和目录的向前/向后兼容方案。

## Outcomes & Retrospective

仅在计划激活并交付后填写；Proposed 状态不代表实现承诺或能力完成。
