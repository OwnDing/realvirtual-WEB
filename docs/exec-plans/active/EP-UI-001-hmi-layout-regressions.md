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
- [x] 建立自动化失败基线和真实页面复现证据
- [x] 实施告警操作区、全屏画布与 KPI 修复
- [x] 完成本地门禁和真实 Chromium 验收
- [ ] 完成远程 PR 门禁并合并 `develop`

## Surprises & Discoveries

- `ViewportFrame` 的现行职责就是主动缩小 WebGL 容器；这与本次用户明确要求的“3D 画布铺满浏览器”直接冲突，应按当前用户要求恢复 full-bleed，同时保留 UI overlay 的安全边距。
- 告警收回按钮的问题不是按钮自身 z-index，而是按钮与长列表共享同一个滚动/收缩上下文。
- KPI 消失不能通过新增静态卡片修复；顶部数据来自模型 plugin 的 `kpi-bar` slot。项目根目录文档以 `rvproject:DemoRealvirtualWeb.glb` 作为稳定字节源时，模型名错误地解析为 `rvproject:DemoRealvirtualWeb`，导致整个模型 plugin pack（KPI、告警、操作按钮）未注册；子目录文档因为最后一个 `/` 恰好遮蔽前缀而未暴露此问题。
- 首次完整 Browser Gate 与仍在运行的开发服务器和 in-app Chromium 竞争内存，`glb-composition` 性能比值在最低可用内存约 0.06 GiB 时失败；释放本任务自有浏览器/服务器后，该测试独立运行得到 1.25x，第二次无并发干扰的完整 Browser Gate 四个分片和独立性能套件全部通过。
- PR #4 首次远程 run `32732754539` 的 Governance、Static、Node、Build 通过；Browser shard 3 在 257 个文件、2681 个测试通过后以 `Vitest failed to find the runner` 失败，零断言失败且资源充足。该证据重新打开 `EP-GOV-004` 的 M4，并把进程边界从四分片收紧为八分片；不靠 rerun 碰绿。
- 八分片本地验证进一步暴露了既有 `discard()` 与已启动 autosave 的竞态：discard 删除草稿后，旧异步写入仍可重新安装指针。`SceneStore` 现跟踪已启动 autosave，discard 等其收敛后再删除；原用例新增 slot 为空的直接断言。该修复不改变字节格式或 slot 命名，只收紧既有“丢弃后不可恢复”的生命周期契约。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-24 | 使用特性分支 + PR，全部修复和门禁通过后才合并 `develop` | 用户当前明确指令；OD-005 已关闭后的分支保护规则 | 不允许直接 push 或绕过 required checks |
| 2026-08-24 | 保持 HMI UI 为 overlay，恢复 `#rv-viewport` full-bleed | 用户当前明确要求；现有容器默认 full-bleed 设计 | 不改变相机、模型或持久化，只改变布局 |
| 2026-08-24 | KPI 只恢复现有 slot 生命周期，不造新业务数据 | 宪法的兼容/诚实交付规则 | 保持模型插件为 KPI 数据/组件来源 |
| 2026-08-24 | 在模型 plugin 身份边界剥离 `rvproject:` 字节源前缀 | 根目录项目文档失败测试、文档 hash 与真实 HMI plugin 注册证据 | 不改变存储 URL 或文档身份，只修正 plugin 名称派生 |

## Validation

- `npx vitest run tests/rv-scene-body-identity.test.ts tests/rv-left-panel.test.ts`：2 files、27 tests 通过；根目录 `rvproject:` plugin 身份回归已固定。
- `npx vitest run tests/rv-scene-undo-redo.test.ts`：35 tests 通过；新增 discard 后 base draft pointer 必须为空的断言通过。
- `npx playwright test e2e/hmi-layout-regressions.spec.ts`：2 tests 通过；覆盖 1280×300 下 full-browser Canvas 与溢出告警的收回按钮边界。
- `./scripts/verify.sh static`：通过，包含治理、文档发布性、ESLint 与 TypeScript。
- `./scripts/verify.sh node`：通过；61 files 通过、2 skipped，633 tests 通过、7 skipped。
- `./scripts/verify.sh browser`：UI 实现后的四分片本地门禁通过；远程 runner 复现后改为八分片，最终本地完整门禁的八个 128–129 file 主 shard 与独立性能套件全部通过，性能套件 11/11。首次本地受资源竞争影响的 `glb-composition` 失败已独立复核为 13 tests 通过、性能比 1.25x；八分片首次运行捕获的 autosave/discard 产品竞态已修复后从头复跑通过，均未用重试隐藏失败。
- `./scripts/verify.sh build`：通过；14918 modules transformed，保留既有 dynamic-import 与大 chunk 警告。
- 真实 in-app Chromium：1280×300 时 `#rv-viewport` 与 Canvas 均为 `(0,0,1280,300)`，告警滚动区 `overflow-y:auto` 且收回按钮完整在视口内；1280×720 时真实模型与 OEE、Parts/h、Cycle、Power 四张 KPI 卡可见，收回/展开交互通过。
- 远程 PR 首轮：run `32732754539` 的 Governance、Static、Node、Build 通过；Browser 因已归因的 runner 生命周期故障失败。八分片修复后的最终 SHA 五项 required checks 待重新验收。

## Rollback

回滚本 PR 的 HMI 布局/测试/计划提交即可；没有 Schema、数据迁移、工业写入或外部部署。若合并后发现视觉兼容问题，优先 revert PR，不需要转换项目或资产数据。

## Outcomes & Retrospective

已完成三个回归的兼容修复与本地验收：告警控制区和卡片滚动区分离，WebGL 恢复全浏览器铺底，项目根目录文档恢复正确模型 plugin 身份及 KPI slot。用户截图中的特定 IndexedDB 工作区文档未存在于本次浏览器 profile，故没有声称按原 `doc` id 打开；其稳定 hash、`rvproject:` 身份边界测试以及默认 Demo 的真实 plugin/KPI 页面共同覆盖根因。没有更改 Schema、持久化格式、DES、智能资产或工业接口；门禁暴露的 autosave/discard 修复只调整异步生命周期顺序。PR #4 已建立，远程 required checks 与合并结果将在计划关闭前补充。
