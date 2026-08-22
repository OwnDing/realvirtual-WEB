---
doc_id: EP-DES-001
title: 公开、行业无关的 DES 完整闭环
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-22
authority: normative
---

# EP-DES-001：公开、行业无关的 DES 完整闭环

## Purpose

交付 [`PS-DES-001`](../../product-specs/PUBLIC_DES.md)：公开 XYvirtual WEB 构建不依赖任何私有 sibling 即可运行真正的离散事件仿真，支持通用流程组件、稳定拓扑、四种运行模式、统计、快照和批量实验。涂装线是第一个业务验收用例，不是内核概念或唯一组件库。

本计划于 2026-08-22 根据用户“先出 ExecPlan”的指令以 Proposed 状态建立。用户同日要求基于当前仓库评估，整体认可后先提交、推送文档，再完成全部阶段；经代码、测试、状态所有权与未决策闸口复核后，本计划转为 Approved / Active，[`ADR-0005`](../../adr/ADR-0005-public-domain-neutral-des.md) 同时 Accepted。

## Scope

- 纯公开的确定性 DES 事件队列、时钟、调度、随机分布、命名动作、组件、MU 和快照内核；
- 通用 Source/Sink/Station/Storage/Conveyor/Router/Resource/Downtime 能力与 MaterialFlow 行为适配；
- `SimulationKernel` 注册公开 runner，Animated/Hybrid/FastForward/Step 行为等价与完整生命周期；
- DES 工作区、事件队列、统计、快照、参数、实验矩阵、批量运行和导出的公开 UI；
- 公开、版本化 `DES_RUNTIME` 契约，兼容旧 `rv_extras`、项目文档和未知字段；
- 将现有 DES 特征测试从 `@rv-private` 迁移到公开导入，从生成的私有排除集合中移除；
- 纯通用流程、物料搬运和涂装线三类黄金切片，以及保存/重开/快照/实验验收；
- 契约、产品规格、ADR、架构门禁、生成物与验收证据同步。

## Non-goals

- 不实现 MES/APS、生产订单执行、约束优化求解器或自动厂房布局；
- 不新增或改变 MQTT、PLC、WebSocket、ThingsBoard、信号方向或工业写权限；
- 不实现涂装配方、漆膜/烘烤质量、流体、能耗或安全认证模型；
- 不建立账户/租户、云端实验队列、多用户同步或审批服务；
- 不改变 OD-003 尚未决定的部署/项目/用户/会话配置优先级；
- 不在本计划中将 DES 插件组件纳入 rv-ODT v1；只建立独立 `DES_RUNTIME` 契约；
- 不通过修改涂装线专用行为、固定结果或隐藏不可用状态来伪造公开 DES 完成。

## Required Documents and Decisions

- [`GOV-CONSTITUTION`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`GOV-AI-SAFETY`](../../governance/AI_SAFETY.md)、[`GOV-DOC-PRIORITY`](../../governance/DOCUMENT_PRIORITY.md)、[`GOV-CHANGE`](../../governance/CHANGE_MANAGEMENT.md)、[`GOV-DOD`](../../governance/DEFINITION_OF_DONE.md)；
- [`PS-DES-001`](../../product-specs/PUBLIC_DES.md)；
- Accepted [`ADR-0005`](../../adr/ADR-0005-public-domain-neutral-des.md)；
- Accepted [`ADR-0003`](../../adr/ADR-0003-stable-assembly-ports.md) 与 [`CONTRACT-ASSEMBLY-PORTS-001`](../../contracts/ASSEMBLY_PORTS.md)；
- rv-ODT v1.1，其现行范围明确排除 DES 插件组件；
- `doc-behavior-modelling.md`、`doc-behaviors.md`、`doc-lifecycle.md`、`doc-persistence.md`、`doc-layout-planner.md` 仅作 reference，关键结论必须与代码/测试交叉验证；
- OD-003 对统一配置 Schema 仍是阻塞闸口；本计划不触及该范围，因此没有当前 OD 阻止纯 DES 实施。

## Current Repository Facts

- 起始分支 `develop`、HEAD `15b6469`，工作树干净且与 `origin/develop` 同步；本计划文档尚未提交/推送。
- 当前工作区没有 `../realvirtual-WebViewer-Private~` 或 `../realvirtual-web-pro` 实现源；公开 Vite/Vitest 使用 `src/private-stubs` 回退。
- `src/private-stubs/des-runner-stub.ts` 把 `createDesRunner` 固定为 `null`；`DESWorkspacePlugin` 只显示不可用面板，事件队列 overlay 也是私有 stub。
- 公开 `src/core/material-flow/` 已有 `SimulationKernel`、`SimulationExecutor`、`MaterialFlowDefinition`、`MaterialFlowAdapter`、`MaterialFlowSelf`、拓扑、tween、统计、运行历史投影和 DESManager 场景节点；公开 UI 已有 DES toolbar、统计/事件队列状态 store 和实验矩阵表面。
- `tests/des/` 有 65 个测试文件；生成的 `tests/private-dependent-tests.json` 当前排除其中 54 个。其中 53 个直接依赖 `@rv-private/plugins/des/*`，是本计划的公开迁移目标；`toray-oee-simulation.test.ts` 依赖 `@rv-projects/Toray/*`，是项目专用模拟而非公共 DES 契约，保持私有排除。其余测试已描述事件队列、runner、通用组件、失效、快照、脚本、实验和批处理契约，但在公开 CI 中不执行。
- rv-ODT 1.1 `specification.md` 明确将 `DES*` 和动态 MaterialFlow 行为 schema 列为 v1 范围外；本计划不得静默转变该契约。
- MQTT、信号绑定和连续仿真目前均在公开组合根注册；本计划不改工业接口。

## State Ownership and Compatibility

- 通用 DES/MaterialFlow 组件参数、行为类型和稳定端口是资产固有事实，位于 GLB/`rv_extras`；实现必须保留未知字段。
- 场景放置、显式连接和项目级覆盖位于项目文档/`RvOp`；不回写只读 Library 资产。
- 仿真时钟、事件队列、MU、当前占用、组件局部状态和 tween 是 runner 所有的运行时事实；它们不随普通项目保存写入 GLB。
- 快照、checkpoint、运行历史和实验结果使用版本化、项目/文档范围的派生产物存储，必须能识别模型版本不匹配与配额失败。
- 旧 GLB、rv-ODT 1.0/1.1、旧 Snap/稳定端口、项目文档、连续模式和 MQTT/PLC 不迁移；没有 DES 元数据的场景在 DES 模式下诚实报空模型，不自动生成演示产量。

## Allowed Paths

- `docs/adr/`、`docs/contracts/`、`docs/product-specs/`、`docs/exec-plans/`、`docs/acceptance/`、`docs/governance/`
- `src/core/material-flow/`、`src/core/sdk/`、`src/core/rv-viewer.ts`、`src/core/rv-viewer-events.ts`
- `src/core/project/`、`src/core/ops/`、`src/core/hmi/scene/`、`src/core/editor/`
- `src/plugins/des/`、`src/plugins/sim-controller/`、`src/plugins/layout-planner/`、`src/plugins/smart-asset-editor/`、`src/behaviors/`
- `src/private-stubs/des-runner-stub.ts`、`src/private-stubs/plugins/des/`
- `src/core/i18n/catalogs/`、`src/main.ts`
- `tests/des/`、`tests/path/`、`tests/simulation-kernel.test.ts`、`tests/des-workspace-coupling.test.ts`、`tests/sim-mode-toggle.node.test.ts`、`tests/private-dependent-tests.json`
- `scripts/gen-private-test-excludes.mjs`、`tsconfig.json`、`vite.config.ts`、`vitest.node.config.ts`
- `e2e/`、`playwright.config.ts`
- `doc-behavior-modelling.md`、`doc-behaviors.md`

## Forbidden Paths

- `src/interfaces/`、MQTT/PLC/WebSocket/CONNECT 连接、生产端点和信号写权限；
- `schema/v1/` 的 DES 纳入或其他语义改变；只能在新 Accepted ADR 后单独执行；
- `src/behaviors/PaintLineAssembly.ts` 及 `src/plugins/models/DemoPaintLine/` 的业务逻辑修改；它们只可被验收消费，不得被改成专用 DES 后门；
- `../realvirtual-WebViewer-Private~/`、`../realvirtual-web-pro/` 和任何客户/生产项目；
- OD-003 未决定的统一配置优先级、OD-001 的账户/云服务边界；
- 删除、跳过、静音、放宽或伪造现有 DES 测试；
- 未经用户明确要求的提交、推送、部署或外部写入。

## Milestones

### M0 — 公开契约与失败基线

接受 ADR-0005，建立 `DES_RUNTIME` 契约与架构依赖门禁。把事件队列、manager、runner、通用组件的代表性测试先改为公开导入，记录因实现缺失而失败的红色基线。生成私有排除列表的机制保留，但 DES 文件要随公开实现逐批从排除中消失，不允许一次性手改生成区块。

反例：任何公共 DES 导入 `PaintLine*`/Demo、快照包含函数/Three.js 对象、未知契约版本被静默读取均必须失败关闭。

### M1 — 确定性调度黄金切片

实现公开事件记录、四叉堆队列、命名动作表、仿真时钟、取消、同时事件稳定排序、随机数/分布和事件风暴/无限零延迟保护。以一个不依赖 Three.js 或任何业务组件的 `Source-like event → Station-like delay → completed counter` 建立第一个可运行切片。

测试覆盖 100k 事件、容量扩展、相同时间/优先级 FIFO、取消、NaN/负时间、失败动作和同种子重现。

### M2 — 通用实体、组件与拓扑

实现公开 MU、DESComponent 和 Source/Sink/Station/Storage/Conveyor/Router/Resource/Downtime；完成稳定端口/逻辑连接解析、`canAccept`/`onDownstreamReady` 回压、分支/合流、容量、在途失效和实体守恒。将现有 `MaterialFlowDefinition`/`MaterialFlowAdapter` 接到调度器，使 Conveyor、Turntable、Source、Sink、AGV 等公开行为能以相同决策逻辑运行在连续与 DES 模式。

黄金流程为 `Source → Station → bounded Buffer → Router → two Sinks`；断路、满容量、不兼容端口、路由无目标、故障中抵达和恢复都有可观察结果。

### M3 — SimulationKernel、四模式与生命周期

实现并直接注册公开 DES runner，使 `SimulationKernel.hasDesRunner()` 在公开构建真实返回可用。完成 Animated/Hybrid/FastForward/Step，固定事件时间与视觉 tween 解耦，FastForward 按时间/事件预算分片让出主线程。覆盖 continuous ↔ DES 切换、暂停原因、重置顺序、模型加载/清理、插件停用/恢复和资源释放，不改变连续 Tick 契约。

四模式在同一参数/种子下必须产生同一产出、实体终态和统计；模式切换不重复生成 MU 或遗留定时器/订阅。

### M4 — 公开工作区、创作与诊断

取消公开构建的 runner-unavailable 陷阱，实现公开事件队列 overlay、统计面板、组件状态与错误诊断。在现有 Editor/Inspector/Planner 上提供通用 DES 组件创建/配置面，包含时间、分布、容量、端口、路由、资源和失效参数。所有编辑继续走统一文档/`RvOp`/保存链路，无效参数、断路、重复 ID、没有源/汇和完全空事件队列必须可定位。

键盘、中英文、误触连点、禁用插件、加载旧资产与取消编辑均纳入验收。

### M5 — 快照、运行历史与实验

实现版本化快照、命名动作恢复、组件/MU/驱动/信号/脚本/tween 状态、checkpoint 和不中断续跑等价。完成项目/文档范围的实验存储、参数覆盖、种子管理、多次复制、通用随机数、批量运行/取消、保留策略、置信区间、瓶颈与 CSV/JSON 导出。

覆盖模型版本不匹配、旧快照版本、存储配额失败、中途取消、不完整运行、异常脚本和项目切换；不将分析产物写回 Library GLB。

### M6 — 跨行业黄金流程

用同一公开 runner 完成三类行为级验收：

1. **纯通用 fixture**：Source → Station/Buffer → Router → Sink，无模型/行业代码依赖；
2. **物料搬运 fixture**：用公开 Conveyor/Turntable/AGV 和稳定端口实现分支、回压、在途动画与快进；
3. **涂装线 fixture**：组装资产作为消费者提供处理时间、缓冲和路由参数，运行一个班次并输出产量/WIP/利用率/瓶颈；不改公共内核也不伪造漆膜质量。

至少一个 Playwright 流程覆盖 Library/Planner 组装 → 通用 DES 配置 → FastForward → KPI/瓶颈 → 保存项目 → 重开 → 同种子重现。三类 fixture 中任意一类的专用补丁不能作为另两类的验收依据。

### M7 — 完整迁移、性能与交付

将范围内所有 DES 特征测试改为公开导入，重新生成排除列表，并用门禁保证不会回到 `@rv-private`/stub。运行 governance、static、Node、Browser、Build 和聚焦 E2E；建立事件处理、快照尺寸/恢复、FastForward 主线程让出和大模型内存基线。更新契约、参考文档、生成文档、验收矩阵和 ExecPlan 证据，再移入 completed。

## Progress

- [x] 盘点公开 DES 骨架、私有 stub、Schema 边界与现有特征测试
- [x] 建立 Approved `PS-DES-001`、Proposed `ADR-0005` 与 Proposed `EP-DES-001`
- [x] 用户批准 ExecPlan 并接受 ADR-0005
- [ ] M0 公开契约与失败基线
- [ ] M1 确定性调度黄金切片
- [ ] M2 通用实体、组件与拓扑
- [ ] M3 SimulationKernel、四模式与生命周期
- [ ] M4 公开工作区、创作与诊断
- [ ] M5 快照、运行历史与实验
- [ ] M6 跨行业黄金流程
- [ ] M7 完整迁移、性能与交付

## Surprises & Discoveries

- 公开层并不是“没有 DES”：它已有统一 kernel、MaterialFlow 定义/self/adapter、tween、统计、工作区、toolbar 和实验矩阵的外壳；真正缺口是被私有注入的调度、运行态、宿主适配和存储实现。
- `tests/des/` 已保留丰富行为契约，但 54/65 文件被公开构建排除。这些测试是迁移目标不是可删除的历史负担。
- rv-ODT v1.1 对 DES 的排除是明确的规范边界，不是一个可直接补 `$defs` 的遗漏。公开 DES 先建立独立运行契约，避免本计划静默改变交换格式范围。
- 现有涂装线行为是连续模式的特定消费者，其应作为跨行业验收的最后一层，不应被当成 DES 内核开发的第一个依赖。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-22 | 产品下一阶段为公开 DES | 用户当前明确指令 | 不重做 MQTT，补齐公开构建目前只有 DES shell/stub 的核心缺口 |
| 2026-08-22 | 涂装线只是验收 fixture，不是公共内核领域 | 用户强调产品不只面向涂装线 | 以通用事件/实体/资源/队列/路由契约和多领域验收防止业务污染 |
| 2026-08-22 | 本轮只交付 Proposed ExecPlan/ADR，不实施代码 | 用户要求“先出 ExecPlan” | 先审查大型边界、契约和里程，获批后再转 Active/Accepted |
| 2026-08-22 | 接受 ADR-0005 并激活 EP-DES-001 | 用户要求评估后整体认可即先提交推送文档、再完成全部阶段 | 审查确认模块边界、状态所有权和回滚方案可执行；将 53 个公共 DES 测试与 1 个 Toray 项目测试分离，并补齐创作/项目作用域实施路径 |

## Validation

计划起草阶段：

- `./scripts/verify.sh governance`：要求新规格、ADR、ExecPlan、索引和链接通过。
- `git diff --check`：要求文档无空白/补丁格式问题。

计划实施阶段必须记录：

- 聚焦纯算法、组件、适配、快照、实验、存储与 UI 测试的逐里程结果；
- `node scripts/gen-private-test-excludes.mjs` 后的生成物漂移测试，确认 DES 不再被公开门禁排除；
- `./scripts/verify.sh governance`、`static`、`node`、`browser`、`build` 和聚焦 `e2e`；
- 四模式等价、快照续跑、项目保存/重开、模型清理/插件停用与错误路径；
- 100k/1M 事件、500/5,000 组件和可配置 MU 数的性能/内存基线，不用未实测数字做产品声称；
- 纯通用、物料搬运和涂装线三类浏览器证据；
- 真实 PLC/MQTT、客户模型、生产连接、多浏览器/GPU 和人工 UX 的已验证/未验证边界。

## Rollback

- M0–M2 在公开 factory 切换前可通过不注册新 runner 回退，不触及旧项目或 GLB。
- M3 后的紧急回滚使用部署能力开关禁用 DES 工作区，保留连续仿真；不恢复展示假可用状态的 `null` runner。
- `DES_RUNTIME` 与快照契约发布后只能向前兼容修复；快照/实验数据不得由代码回滚静默删除。
- 没有真实设备写入、服务端迁移或外部资源创建；代码回滚不需要工业设备补偿。

## Outcomes & Retrospective

待计划获批、实施并完成后填写实际行为、全部验证证据、性能数据、迁移偏差、未验证真实环境和后续债务。
