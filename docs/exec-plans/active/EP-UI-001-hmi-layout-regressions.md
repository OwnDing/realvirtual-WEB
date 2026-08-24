---
doc_id: EP-UI-001
title: HMI 告警、全屏 3D 与 KPI 看板回归修复
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-24
authority: normative
---

# EP-UI-001：HMI 告警、全屏 3D 与 KPI 看板回归修复

## Purpose

修复近期智能资产编辑、DES 等功能合入后暴露的三个 HMI 回归：告警较多时收回按钮仍在可视区且可操作，Three.js 画布恢复铺满浏览器，HMI 模式顶部 KPI 看板恢复显示。修复必须通过特性分支和 PR，在适用门禁与真实 Chromium 页面验证通过后才能合并到 `develop`。

## Scope

- 复现并固定告警消息列表溢出时的操作区布局；
- 恢复 HMI 下 WebGL 画布全浏览器铺底，UI 继续作为 overlay；
- 恢复 HMI 模式中已注册 KPI slot 的可见性；
- 增加防止三个行为再次漂移的 Node/Browser/E2E 检查；
- 完成 PR 的五项远程质量门禁并合并到 `develop`。

## Non-goals

- 不改变 DES 时钟、事件队列、快照、实验或 MaterialFlow 语义；
- 不改变智能资产的 GLB、`rv_extras`、保存、发布或项目文档契约；
- 不新增 KPI/告警业务数据，不用固定演示数据替代插件内容；
- 不改变 PLC、MQTT、WebSocket、CONNECT 或真实设备写权限；
- 不重做 HMI 视觉体系、工作区 mode 语义或持久化配置优先级。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-CHANGE`、`GOV-DOD`；
- `doc-ui-visibility.md`、`doc-lifecycle.md`、`doc-events-and-hooks.md`，仅作 reference 并与代码、测试及运行证据交叉验证；
- 已完成 `EP-ASSET-001`、`EP-DES-001`、`EP-DES-002` 仅用于确认本修复不得改变其状态所有权或公共契约；
- 本任务不触及 `OPEN_DECISIONS.md` 中未关闭事项，不需要新 ADR。

## Current Repository Facts

- 起始分支 `develop`，HEAD `d93c315`，工作树干净且与 `origin/develop` 同步；已创建特性分支 `codex/fix-hmi-layout-regressions`。
- `ViewportFrame` 当前会把 `#rv-viewport` 按左右/顶部 HMI chrome 写入 inset；画布因此不是全浏览器铺底。
- `MessagePanel` 的桌面展开态把收回按钮与可滚动告警卡放在同一 `overflow: auto` flex column，长列表会使操作区随内容滚出可视范围。
- `KpiBar` 只在 slot 非空时呈现；需通过真实 HMI 启动与 plugin 生命周期确认“看板消失”是容器可见性还是模型插件注册回归，不能先写死 KPI。
- `develop` 受五项 required checks 保护，管理员不可绕过；只能通过特性分支 PR 合并。

## State Ownership and Compatibility

本修复只调整瞬态 UI 布局、可见性与相应测试，不写入 GLB、`rv_extras`、项目文档、部署配置、用户偏好或工业信号。既有 NodeId、资产引用、保存场景与插件 slot 契约保持不变。

## Allowed Paths

- `docs/exec-plans/`
- `docs/acceptance/`
- `src/core/hmi/`
- 与根因直接相关的窄范围 plugin/组合根文件
- `tests/`
- `e2e/`

## Forbidden Paths

- `src/core/material-flow/`、DES 运行时契约与算法；
- `src/core/editor/`、`schema/`、GLB/`rv_extras` 持久化格式；
- `src/interfaces/` 与真实工业连接；
- 测试删除、跳过、静音、放宽或固定业务结果；
- 未经门禁通过直接推送或合并 `develop`。

## Milestones

### M1 — 失败基线与根因

用组件测试和真实 Chromium 页面分别观察三个现象，记录 DOM 边界、`#rv-viewport` 样式、KPI slot/active mode/plugin 生命周期；测试在修复前能够揭示错误行为。

### M2 — 最小兼容修复

让告警操作区固定在可见容器、仅卡片列表滚动；让 WebGL 画布全屏铺底；恢复 HMI KPI slot 的正常注册/呈现，不改变非 HMI mode 的可见性契约。

### M3 — 本地与远程验收

运行治理、静态、Node、Browser、Build 和聚焦 E2E；在桌面 Chromium 检查长告警列表、全屏 Canvas、KPI、模式切换和 console error。推送 PR 并等待五项 required checks 全绿后合并 `develop`，再复核远端分支状态。

## Progress

- [x] 核对用户授权、工作树、分支、remote 与治理要求
- [x] 建立三个现象的代码事实与初始根因假设
- [ ] 建立自动化失败基线和真实页面复现证据
- [ ] 实施告警操作区、全屏画布与 KPI 修复
- [ ] 完成本地门禁和真实 Chromium 验收
- [ ] 完成远程 PR 门禁并合并 `develop`

## Surprises & Discoveries

- `ViewportFrame` 的现行职责就是主动缩小 WebGL 容器；这与本次用户明确要求的“3D 画布铺满浏览器”直接冲突，应按当前用户要求恢复 full-bleed，同时保留 UI overlay 的安全边距。
- 告警收回按钮的问题不是按钮自身 z-index，而是按钮与长列表共享同一个滚动/收缩上下文。
- KPI 消失不能通过新增静态卡片修复；顶部数据来自模型 plugin 的 `kpi-bar` slot，必须检查 plugin 是否随文档加载正确注册。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-24 | 使用特性分支 + PR，全部修复和门禁通过后才合并 `develop` | 用户当前明确指令；OD-005 已关闭后的分支保护规则 | 不允许直接 push 或绕过 required checks |
| 2026-08-24 | 保持 HMI UI 为 overlay，恢复 `#rv-viewport` full-bleed | 用户当前明确要求；现有容器默认 full-bleed 设计 | 不改变相机、模型或持久化，只改变布局 |
| 2026-08-24 | KPI 只恢复现有 slot 生命周期，不造新业务数据 | 宪法的兼容/诚实交付规则 | 保持模型插件为 KPI 数据/组件来源 |

## Validation

待执行并补充实际结果：

- 聚焦组件/Node 测试；
- 聚焦 Playwright HMI 布局回归；
- `./scripts/verify.sh governance`；
- `./scripts/verify.sh static`；
- `./scripts/verify.sh node`；
- `./scripts/verify.sh browser`；
- `./scripts/verify.sh build`；
- 真实 Chromium 页面：长告警列表、收回按钮、Canvas 边界、KPI、HMI/其他 mode、console/page error；
- GitHub PR required checks 五项全绿。

## Rollback

回滚本 PR 的 HMI 布局/测试/计划提交即可；没有 Schema、数据迁移、工业写入或外部部署。若合并后发现视觉兼容问题，优先 revert PR，不需要转换项目或资产数据。

## Outcomes & Retrospective

完成后补充实际修改、验证证据、偏差、未验证项和 PR/合并结果。
