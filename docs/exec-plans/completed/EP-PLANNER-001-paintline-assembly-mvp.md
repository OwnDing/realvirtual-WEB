---
doc_id: EP-PLANNER-001
title: 可手工组装涂装线数字孪生 MVP
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-22
authority: normative
---

# EP-PLANNER-001：可手工组装涂装线数字孪生 MVP

## Purpose

交付 [`PS-PLANNER-001`](../../product-specs/PAINTLINE_ASSEMBLY_MVP.md) 的端到端闭环：Planner 默认可见本部署明确配置的涂装线库，用户能用模块组装闭合路线，运行数据驱动的输送与涂装行为，并保存、重新打开后继续编辑。

本计划于 2026-08-22 直接以 Approved / Active 开工。批准来源：用户明确同意五项建议并要求“编写 execplan，然后按照计划执行完成”。

## Scope

- 部署层明确订阅内置目录并保留项目/URL 显式目录能力；
- rv-ODT 1.1 `AssemblyPort`、旧 Snap 兼容解析、目录索引、Planner/MCP 选择器；
- 最小模块化涂装线库及可复现生成器；
- 与 Demo 世界坐标解耦的拓扑、载具、工艺、涂色和 KPI 行为；
- Planner 放置/吸附/错误、运行、保存和重开黄金流程；
- 契约、产品规格、ADR、测试与验收证据同步。

## Non-goals

不接真实 PLC/MQTT，不写生产设备，不引入云端账户/权限，不实现自动布线、多人协作、完整工艺仿真、显式连接边 Schema 或复杂分支调度。

## Required Documents and Decisions

- [`GOV-CONSTITUTION`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`GOV-AI-SAFETY`](../../governance/AI_SAFETY.md)、[`GOV-DOC-PRIORITY`](../../governance/DOCUMENT_PRIORITY.md)；
- [`PS-PLANNER-001`](../../product-specs/PAINTLINE_ASSEMBLY_MVP.md)；
- Accepted [`ADR-0003`](../../adr/ADR-0003-stable-assembly-ports.md)；
- [`CONTRACT-ASSEMBLY-PORTS-001`](../../contracts/ASSEMBLY_PORTS.md) 与 rv-ODT v1；
- OD-004 在上述批准与契约落地后关闭；
- `doc-layout-planner.md` 仅作 reference，结论必须与代码和测试交叉验证。

## Current Repository Facts

- 开始分支 `develop`，工作树干净；未提交、未推送。
- `public/library/catalog.json` 有 25 个条目，其中 Paint Line 8 个，但 `LayoutPlannerPlugin` 的默认目录为空；只有项目清单或 `?library=` 显式提供时才可见。
- 既有四个工艺段只有名称型 `Snap-*`；完整悬挂链、机器人和工件不是可拼装轨道模块。
- `DemoPaintLine` 的喷涂、涂色和 KPI 依赖固定世界坐标与预制拓扑，不能复用到用户布局。
- 既有 Snap 运行时 ID 是 UUID，目录与放置 API 选择 `ownSnapName`；重载靠几何重建配对。
- 基线聚焦测试 `tests/paintline-library.node.test.ts` 为 52/52 通过；既有文档明确记录 Planner 手工拖拽路径未完成验证。

## State Ownership and Compatibility

- 稳定端口写入资产节点 `extras.realvirtual.AssemblyPort`；运行时配对仍归 Snap registry，瞬时载具位置归行为实例。
- 部署内置目录由应用组合根显式配置，不改变 Layout Planner 核心“无隐式目录”的契约。
- 新资产双写 `AssemblyPort` 与 `Snap-*`；旧 GLB、rv-ODT 1.0、旧项目和 `ownSnapName` 调用继续工作。
- 项目保存设备布局与资产元数据，不新增连接边；重新打开后确定性重建。

## Allowed Paths

- `docs/adr/`、`docs/contracts/`、`docs/product-specs/`、`docs/exec-plans/`、`docs/governance/OPEN_DECISIONS.md`、`docs/acceptance/`
- `schema/v1/`
- `src/main.ts`、`src/behaviors/PaintLineAssembly.ts`
- `src/core/project/backends/bundled-backend.ts`
- `src/plugins/layout-planner/`、`src/plugins/snap-point/`、`src/plugins/paintline-assembly/`、`src/plugins/models/DemoPaintLine/`
- `src/core/engine/rv-snap-point-registry.ts`、`src/core/engine/rv-extras-validator.ts`、`src/core/scene-mutations.ts`
- `scripts/build-paintline-library.mjs`、`scripts/extract-paintline-robot.mjs`、`scripts/build-local-library-catalog.mjs`
- `public/library/PaintLine/`、`public/library/catalog.json`
- `tests/`、`e2e/`
- `doc-layout-planner.md`

## Forbidden Paths

- 真实 PLC、MQTT、WebSocket 与生产端点；
- 账户、组织、云项目后端；
- 既有客户 GLB 的破坏性重写；
- generated 内容的手工编辑（必须改生成源后重建）；
- 未经用户要求的提交、推送、部署或外部上传。

## Milestones

### M1 — Library 可见与首个黄金切片

应用组合根显式订阅内置目录；Planner 首次进入可看到 Paint Line 条目。用一个直轨通过真实放置路径进入场景，错误 URL 和空目录保持可诊断。

### M2 — 稳定端口兼容层

落地 rv-ODT 1.1 `AssemblyPort`，扫描、对齐、目录、Planner 与 MCP 优先使用 `PortId`，旧名称回退不回归。覆盖非法元数据、重复 ID、流向和方向反例。

### M3 — 最小模块库

生成直轨、弯轨、回转、工艺、控制器和机器人模块；每个新连接点双写稳定端口。生成物连续两次字节一致，目录和预览可加载。

### M4 — 数据驱动运行行为

从连接拓扑与模块元数据构建闭合路径；闭环才运行，断线安全停止。载具、工艺区、喷涂、机器人动作和 KPI 不依赖 Demo 固定世界坐标，既有 Demo 迁移到同一行为。

### M5 — 保存、重开和完整验收

真实浏览器覆盖 Library → 拖放 → 吸附 → 闭环 → 运行 → 保存 → 重开 → 继续编辑。运行治理、静态、Node、Browser、Build 和聚焦 E2E；记录环境基线、未验证性能与人工视觉证据。

## Progress

- [x] 计划、产品规格、ADR 与端口契约建立
- [x] M1 Library 可见与首个放置切片
- [x] M2 稳定端口兼容层
- [x] M3 最小模块库
- [x] M4 数据驱动运行行为
- [x] M5 autosave 冷重建、聚焦黄金流程与全门禁留证

## Surprises & Discoveries

- 生成后的本地目录从 25 个条目增至 33 个，Paint Line 分类从 8 个增至 16 个；应用组合根必须明确订阅该目录，Planner 核心继续保持空默认目录。
- 曲轨端口若用首末折线段的弦向量代替解析切线，90° 曲线会累计约 7.5° 的闭环误差；生成器改为写入解析入口/出口切线，稳定端口方向与几何拓扑由测试共同约束。
- 目录把 `PaintLineController` 人类化为 `Paint Line Controller`；行为发现模式需同时覆盖机器名和显示名，否则通过 Library 放入的控制器不会启动。
- 工艺区若采样悬挂链顶部的载具根节点，坐标会落在所有隧道体积上方，导致喷涂永不触发；运行时现以实际 `Workpiece-*` 网格为工艺判定点，黄金流程直接断言 `PaintedPieces > 0` 和材质变蓝。
- FANUC 捐赠模型在当前检出中可能是 Git LFS 指针；提取器现在只在可解析捐赠资产存在时重建几何，否则保留已检入机器人并更新稳定端口，避免空模型冒充成功。
- 本机 Chromium/SwiftShader 的 WebGL 上下文预算很小：全量 Browser 门禁在无关的大型缩略图/后处理测试中发生上下文丢失，持续 10 分 34 秒仍未退出后，精确终止了本次门禁进程组；物理 `page.reload()` 后也不能可靠重建 WebGL。聚焦黄金流程因此关闭后台缩略图，并在同一文档内先清空运行态，再读取真实 `rv-layout-autosave`，调用启动时相同的 `loadAutoSave()` + `applyPlacements()` 路径完成冷重建。
- 全量 Node 门禁还发现基线中的两个 i18n inventory 例外（`index.html` 的 `Powered by`、`AGPL-3.0`）已经失效；它们不属于本计划范围，未通过放宽或修改门禁掩盖。
- 新的通用行为用于用户装配资产；既有完整 Demo 继续使用原行为。直接迁移会在同一根节点重复驱动载具并改变已发布 Demo 契约，所以本次把它作为明确兼容偏差保留，而不是静默替换。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-22 | 五项改进作为一个端到端 MVP 执行 | 用户当前明确指令 | 单独增加模型不能解决目录不可见、身份不稳、行为不可复用和保存未验证 |
| 2026-08-22 | 接受 ADR-0003 并关闭 OD-004 | 同一用户指令；ADR/契约/规格落地 | 解开新装配 Schema 与库资产迁移闸口，保留旧 Snap 兼容 |
| 2026-08-22 | 内置目录在应用组合根显式配置 | 既有 explicit-only 架构与产品目标 | Library 核心仍不偷偷注入目录，同时本部署开箱可见 |
| 2026-08-22 | 曲轨/回转端口写解析切线 | 黄金闭环运行证据 | 避免折线弦方向造成累积角误差，`Direction` 仍保持端口节点局部坐标语义 |
| 2026-08-22 | 保留既有 Demo 行为，新装配使用 `PaintLineAssembly` | 兼容性契约与运行时验证 | 防止同一 Demo 被双重驱动；通用行为不依赖 Demo 世界坐标 |
| 2026-08-22 | 黄金流程以同文档冷重建验证 autosave | 本机 SwiftShader 可复现上下文丢失 | 验证真实持久化记录、稳定 ID 和启动重建代码路径；不把该证据描述成物理页面刷新 |

## Validation

| 闸门/证据 | 结果 |
| --- | --- |
| `npm run build:paintline` | 通过；15 个生成对象、16 个 Paint Line 目录条目，Demo 同步重建 |
| 生成器连续双跑及 SHA-256 对比 | 通过；Paint Line GLB、目录、Demo 与场景索引无字节差异 |
| 聚焦单元/Node | 109/109 通过：4 个 AssemblyPort、5 个拓扑行为、98 个资产、2 个部署目录用例 |
| `npx playwright test e2e/paintline-assembly.spec.ts --project=chromium` | 1/1 通过（27.3 秒）：喷房真实拖放、PortId 闭环、运行、工件喷涂变色、autosave 冷重建后恢复喷涂 |
| `./scripts/verify.sh static` | 通过：Governance、可发布文档、ESLint 与 TypeScript |
| `./scripts/verify.sh node` | 620 通过 / 7 跳过 / 1 个既有 stale i18n exception 失败；本计划测试全过 |
| `./scripts/verify.sh browser` | 本机 SwiftShader 上下文丢失后全量用例广泛失败并挂起；10 分 34 秒精确终止该门禁进程组，无最终计数 |
| `./scripts/verify.sh build` | 通过；14,881 个模块，Vite production build 约 1 分 25 秒 |

## Rollback

- 应用目录配置可单独移除，项目/URL 目录机制不受影响。
- 新字段为加法；停止生成 `AssemblyPort` 后旧名字路径仍可工作，已发布元数据不改变解释。
- 新模块和全局行为可按插件/目录条目整体撤回；既有完整 Demo 资产保留。
- 无外部写入、数据库迁移或真实设备状态；代码回滚不需要外部补偿。

## Outcomes & Retrospective

五项产品问题形成了一个可运行闭环：本部署开箱显示 Paint Line Library；真实 HTML5 拖放可放入喷房；rv-ODT 1.1 稳定端口贯通扫描、对齐、目录、Planner 与 MCP；16 个 Paint Line 条目覆盖最小模块库；`PaintLineAssembly` 从端口配对与模块元数据构建路线，开环安全停止、闭环驱动载具/工艺/KPI，工件进入喷房后计数并变色；autosave 冷重建后布局 ID、端口、拓扑、运行和喷涂状态恢复。

聚焦证据为 109/109 单元与 Node 用例、1/1 Playwright 黄金流程，生成器连续两次 SHA-256 一致；Static 与 Build 通过。全量门禁的已知偏差是：Node 仅剩上述 1 个既有 stale i18n exception 用例；Browser 受本机 SwiftShader 上下文耗尽影响并在挂起后被精确终止。真实 PLC/机器人、生产连接、GPU 性能及人工全界面视觉巡检未验证。

M4 原计划提出把既有 Demo 迁移到同一行为，实际为保护已发布 Demo 契约而保留旧行为；可手工组装的新资产已经完全走数据驱动行为。M5 验证了真实 autosave 记录和与启动相同的冷重建路径，但没有把本机失败的物理页面刷新伪报为通过。后续若要把连接关系写入项目文档、验证正式项目文档保存或统一旧 Demo，需分别建立 Schema/迁移计划。
