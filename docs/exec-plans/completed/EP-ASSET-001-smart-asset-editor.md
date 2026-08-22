---
doc_id: EP-ASSET-001
title: 智能资产编辑器完整闭环
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-22
authority: normative
---

# EP-ASSET-001：智能资产编辑器完整闭环

## Purpose

交付 [`PS-ASSET-001`](../../product-specs/SMART_ASSET_EDITOR.md)：公开构建可以新建/打开/导入资产，使用智能向导制作端口、行为和信号，校验后通过统一保存发布到项目 Library，并在 Planner 立即复用。

本计划于 2026-08-22 直接以 Approved / Active 开工。批准来源：用户明确确认无许可问题并要求做好 ExecPlan 后完全实现智能资产编辑功能。

## Scope

- 公开 `asset-editor` 插件与 detached Editor mode；
- 新建、当前项目/Library 打开、GLB 追加导入、撤销/重做和草稿；
- 资产概览、层级/Inspector 协作、端口/模板/信号智能向导；
- 可定位、区分 error/warning 的发布前校验；
- 统一保存、项目重扫、Library 刷新和 Planner 复用；
- 中英文目录、契约/ADR/规格、测试与验收证据。

## Non-goals

不改 MQTT/PLC/接口权限，不接 ThingsBoard，不增加工业协议，不实现 STEP/JT/USD 公共转换器、刚体机构编辑器、自动 CAD 识别、完整 DES、云资产市场或真实设备写入。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-DEFINITION-OF-DONE`；
- [`PS-ASSET-001`](../../product-specs/SMART_ASSET_EDITOR.md)；
- Accepted [`ADR-0004`](../../adr/ADR-0004-public-smart-asset-authoring.md)；
- Accepted [`ADR-0003`](../../adr/ADR-0003-stable-assembly-ports.md) 与 [`CONTRACT-ASSEMBLY-PORTS-001`](../../contracts/ASSEMBLY_PORTS.md)；
- rv-ODT v1.1、`doc-persistence.md`、`doc-lifecycle.md`、`doc-layout-planner.md`、`doc-node-paths.md`、`doc-ui-visibility.md`、`doc-events-and-hooks.md`（旧文档均与代码/测试交叉验证）。

## Current Repository Facts

- 开始分支 `develop`、HEAD `35f7904`，工作树干净；未提交、未推送。
- `AssetDocument`、统一操作/草稿/保存、GLB 导出、组件 Inspector、统一 GLB 导入与 Project Library provider 已在公开 core。
- 公开组合根明确不注册 Editor；`@rv-private` stub 的 pending-open 和 save-flow 是 no-op，因此 Projects/MCP 的编辑入口不能形成公开闭环。
- `importIntoAsset()` 已为普通 GLB 合成内容哈希 provenance 并复用 `importCad`，无需新增持久化操作。
- `saveDocument()` 是现行唯一安全保存入口；`saveAssetToCustomLibrary()` 是旧兼容 helper，不能作为新工作流主路径。

## State Ownership and Compatibility

- GLB/`rv_extras` 拥有资产几何、节点、稳定 ID、组件、端口、行为参数和信号；
- 项目文档拥有 Planner 实例、布局与项目覆盖；Editor 不写这些状态；
- pending-open 仅为内存交接；UI 表单瞬态不持久化；
- 端口双写 `AssemblyPort` 与 `Snap-*`，未知字段保留；不改变既有 op/项目/MQTT Schema。

## Allowed Paths

- `docs/adr/`、`docs/product-specs/`、`docs/exec-plans/`、`docs/acceptance/`
- `src/main.ts`、`src/core/editor/`、`src/core/hmi/projects/`
- `src/plugins/smart-asset-editor/`、`src/plugins/unified-import/`
- `src/core/i18n/catalogs/`
- `tests/`、`e2e/`

## Forbidden Paths

- 真实 PLC/MQTT/WebSocket 连接与生产端点；
- 未授权提交、推送、部署或外部上传；
- 既有 GLB/项目的破坏性迁移；
- generated 区块手工修改、测试放宽/静音或伪造完成。

## Milestones

### M1 — 公开 Editor 黄金切片

注册公开插件与 detached mode；进入 Editor 后加载空资产或 pending-open 资产，安装/释放 ActiveAssetContext 和 EditTarget；通用 Hierarchy/Inspector 可写入同一文档。

### M2 — 智能资产模型与校验

实现纯函数模板、端口/信号构造、节点扫描和发布报告。覆盖非法方向、重复稳定 ID/端口/信号、空几何、缺参数及未知字段兼容反例。

### M3 — 完整工作区与导入

实现概览、文件/文档动作、Ports、Behavior、Signals、Validation/Publish 五步 UI；统一 Import 调用公开 plugin `importItems()` 并形成可撤销操作。

### M4 — 统一保存与 Library 复用

保存/另存为只走 `saveDocument()`；成功后更新 open identity、重扫项目文档并刷新 Project Library，Planner 可见且可拖放。冲突、只读/无项目、坏文件和 dirty 离开均有可观察结果。

### M5 — 完整验证与交付

运行治理、静态、Node、Browser、Build 与聚焦 E2E；更新索引/验收矩阵，将计划移入 completed，披露真实 PLC、客户模型、GPU 性能和人工 UX 未验证项。

## Progress

- [x] 完成治理、契约、持久化、Planner、生命周期和代码事实盘点
- [x] 建立产品规格、Accepted ADR 与 Active ExecPlan
- [x] M1 公开 Editor 黄金切片
- [x] M2 智能资产模型与校验
- [x] M3 完整工作区与导入
- [x] M4 统一保存与 Library 复用
- [x] M5 完整验证与交付

## Surprises & Discoveries

- 普通 GLB 追加导入已由公开 `rv-import-asset.ts` 显式设计：它生成 `Quality: 'glb'` 的 provenance 并走相同内容哈希缓存，因此无需新增 `importGlb` op。
- 公开 core 比 UI 完整得多；主要缺口是组合根、open/save 编排和面向资产语义的向导，不是重写编辑/持久化内核。
- 最新持久化契约要求走 `saveDocument()`，而非早期只写 `library/Custom` 的 helper；新实现必须顺带刷新两套列表，但不能绕过统一 writer。
- `ModeManager` 在 activate hook 返回后才提交 `activeMode` 和 mode UI context；Editor 必须延迟一个 microtask 再加载模型，否则 `clearModel()` 会按旧 mode 清掉 Editor slot。
- 现有项目文档必须原路径保存；内置、provider、外部引用资产和显式“另存为”才发布为 `library/Custom` 副本。统一 writer 已具备这一区分，Editor 只负责路由意图。
- Headless 软件 GPU 警告会覆盖发布页签，且浏览器存储警告需要在 E2E 中明确关闭；黄金流程因此固定 `en-US`、处理已知提示，并对被警告层遮挡的页签使用精确强制点击。
- `EP-PLANNER-001` 已按 ADR-0003 把 5 个涂装线领域组件留在 rv-ODT 之外，但规格覆盖测试未应用其 out-of-scope 过滤器；本计划修正测试与 Accepted ADR 的漂移，未放宽 in-scope `$def` 门禁。
- 本工作副本没有 `git-lfs`，`public/models/tests.glb` 保持 36 MB 对象的 LFS 指针；依赖该夹具的 Browser 用例无法在此机加载。单一 Chromium 执行 967 个文件时还会耗尽 SwiftShader WebGL context；失败文件用全新进程逐项复验并如实留证。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因与影响 |
| --- | --- | --- | --- |
| 2026-08-22 | 公开实现完整 `asset-editor` 与 Editor mode | 用户当前明确指令；ADR-0004 | 消除公开构建 no-op 入口，私有能力变为可选扩展 |
| 2026-08-22 | 复用现有 `importCad` 语义导入普通 GLB | 代码与持久化文档事实 | 不增加 op/schema，保留撤销、草稿和缓存一致性 |
| 2026-08-22 | 智能模板写已有 `rv_extras` | ADR-0004 与 rv-ODT 权威 | 避免第二资产格式，Planner/运行时可直接消费 |
| 2026-08-22 | 发布保存仅走 `saveDocument()` | `doc-persistence.md` 当前契约 | 保留原路径、CAS、目标绑定和单写者 |

## Validation

- `npx vitest run tests/smart-asset-model.test.ts tests/smart-asset-editor-plugin.test.ts tests/smart-asset-save-flow.test.ts`：3 files、9 tests passed。
- i18n 聚焦门禁：3 files、26 tests passed；`node scripts/i18n-inventory.mjs` 的 gated total 为 0，既有 advisory 为 error messages 319、Intl 22，均有显式登记。
- `npx vitest run tests/spec-loading.test.ts`：1 file、65 tests passed；涂装领域 out-of-scope 与 ADR-0003 对齐。
- `npm run gen:mcp-docs`：从工具注册源重生成 MCP 文档，随后 drift test 20 tests passed。
- `./scripts/verify.sh governance`：49 governed documents passed，publishable docs passed。
- `./scripts/verify.sh static`：governance、ESLint、public TypeScript passed。
- `./scripts/verify.sh node`：58 files（2 skipped），621 tests passed、7 skipped。
- `./scripts/verify.sh build`：14,888 modules transformed，production build passed；只出现既有 dynamic-import/chunk-size warnings。
- `npx playwright test e2e/smart-asset-editor.spec.ts`：1 test passed（26.7 s）；实际完成新建、GLB 导入、涂装轨道模板、2 端口、PLCOutput 信号、0 error 校验、发布到 `library/Custom` 和 clean document。
- `./scripts/verify.sh browser`：全套执行完成，967 files 中 935 passed、27 failed、5 skipped；10,392 tests passed、109 failed、12 skipped、2 todo，另有 11 unhandled errors。失败分析后，规格漂移与 MCP 生成文档 2 files 已修复并分别独立通过；8 个失败文件在新 Chromium 中独立通过。其余偏差来自缺失 LFS `tests.glb` 或本机 SwiftShader 在单文件/全套中耗尽 WebGL context，并非智能资产路径回归。未删除、跳过、静音或放宽相关测试。

## Rollback

可整体移除公开插件、mode 注册、core pending-open store 和新增目录项；没有 op/schema 数据迁移，既有资产和项目无需回滚。若已保存新资产，只含现有 `rv_extras` 与兼容 Snap，旧版本仍可读取可识别部分并忽略未知领域扩展。

## Outcomes & Retrospective

公开构建现在拥有可用的 `asset-editor` 插件和 detached Editor mode：用户可新建或从 Projects/Library/MCP 打开资产，追加导入 GLB，复用 Hierarchy/Inspector，撤销/重做，制作兼容端口、涂装行为模板和六类 PLC 信号，定位校验问题，并通过统一 writer 保存/另存为后立即刷新 Project Library。

现有 GLB、`rv_extras`、NodeId、项目文档和 MQTT/PLC 接入行为保持不变；没有新增 op/schema 迁移。未验证项为真实客户模型的批量兼容性、真实 PLC、不同物理 GPU/浏览器的性能与完整人工 UX 走查。回滚只需移除公开插件/mode、pending-open seam 和相应 UI/文档；已发布资产仍是既有 GLB/`rv_extras`，无需数据回滚。
