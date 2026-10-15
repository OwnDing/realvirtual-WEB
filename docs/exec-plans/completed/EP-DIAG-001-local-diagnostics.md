---
doc_id: EP-DIAG-001
title: EP-DIAG-001：L3-1 本地诊断包
status: approved
owner: engineering
last_reviewed: 2026-10-15
authority: normative
plan_status: completed
---

# EP-DIAG-001：L3-1 本地诊断包

## Purpose

客户主动下载可排障、脱敏、默认不外发的单文件诊断包。

## Scope

本地环境/图形/场景/日志采集，生产异常缓存，设置入口与加载错误入口，预览/范围/取消，ZIP 与 JSON 降级，双语和验收。

## Non-goals

上传、AI、服务端合包、工业探测、原始客户数据、跨刷新留存、浏览器完全崩溃恢复。

## Required Documents and Decisions

[GOV-CONSTITUTION](../../governance/DEVELOPMENT_CONSTITUTION.md)、[安全](../../governance/AI_SAFETY.md)、[OD](../../governance/OPEN_DECISIONS.md)、[PS-DIAG-001](../../product-specs/DIAGNOSTIC_BUNDLE.md)、[ADR-0017](../../adr/ADR-0017-local-diagnostics.md)、[契约](../../contracts/DIAGNOSTIC_BUNDLE.md)、[验收](../../acceptance/DIAGNOSTIC_BUNDLE.md)。本范围未触及现有未决 OD 闸口。

## Current Repository Facts

2026-10-13，develop，开始时工作树干净。rv-debug 500 条环形缓冲，ErrorStore 只保留当前告警；DebugEndpointPlugin 仅 DEV 且包含网络/命令语义。已有 jszip、版本/GPU/加载状态。Appliance runDiagnostics 包含网络和存储写探针，本次不直接调用。

## State Ownership and Compatibility

诊断为页面内存派生数据，无存储/GLB/项目/配置迁移；不改变原日志 API 与生命周期权威。

## Allowed Paths

- src/core/diagnostics/、src/plugins/diagnostics/、src/core/engine/rv-debug.ts
- src/main.ts、src/plugins/debug-endpoint-plugin.ts、src/core/i18n/、index.html（必要的错误 UI 接线）
- vite.config.ts：诊断启动运行时的独立构建块及对应体积守卫。
- tests/、scripts/、docs/ 中本任务范围、必要测试运行配置

## Forbidden Paths

- schema/v1/、私有 sibling、客户模型与持久化数据、依赖锁文件

## Milestones

M0 文档冻结；M1 设置→采集→脱敏→ZIP 黄金切片；M2 异常/失败/取消/降级；M3 门禁、生产/离线下载、操作文档。

## Progress

- [x] M0：用户批准方案；规格/ADR/契约/计划落地。
- [x] M1：设置入口、中英双语、白名单快照、范围开关、预览与 ZIP 导出。
- [x] M2：页面异常缓存、原生错误入口、取消/防重复/卸载、分项失败、JSON 降级与上下文丢失导出。
- [x] M3：公共静态、Node、全部浏览器分批及独立性能测试、生产构建与隔离网络下载通过，操作文档及证据归档。

## Surprises & Discoveries

- 既有 console 捕获只在 DEV 调试端点，需要生产本地采集且验证组合卸载。
- rendererKind/hasCompute 才能区分 WebGPU 与 GL 回退，不能用 isWebGPU 推断。
- 当前 Three.js WebGPUBackend 保留 device，不保留所请求的 adapter；读取 device.limits / adapterInfo，无需发起新探测。
- 本机 loopback 部署的 CONNECT 插件会独立重试 `/health`。生产诊断夹具使用已有的用户断开偏好，隔离该背景行为；诊断网络断言仍只允许同源静态资源 GET，未放行服务请求。
- i18n 库存误把包格式固定标记 `[free text omitted]` 识别为插件标签，增加仅此标记的精确例外，界面解释继续由中英目录提供；日期显式随当前 locale 格式化。
- 超限裁剪初版每删除一条就序列化全部报告；压力测试暴露耗时，改为保留相同优先级的二分裁剪，完整日志快照及字节清单同时更新。
- 并行构建时既有登录限流测试出现 5 秒超时；记录原失败，在低负载下复核，未修改其超时或断言。
- 原加载错误遮罩与 React 根节点同为 z-index 1000，窄屏设置窗口遮挡故障导出。错误态提高到 23000，高于设置窗口和 22000 的加载预览；重试时恢复普通层级。
- 基线入口仅剩 280 字符预算，新诊断启动代码令入口超限 17609。保留启动失败捕获与本地 JSON 能力，将采集/导出/日志环放入独立可缓存 `diagnostics-runtime`；组件读取通过插件注入，避免把场景注册表及 Schema 拖入该块。原入口预算保持；新增运行时 <32000 字符、入口与运行时合计 <3545000 字符的守卫，明确此拆分不减少总启动下载量。
- 曾验证旧测试注释建议的 MCP 帮助按需加载候选，实际当前 MCP 插件本已延迟加载，对主入口无收益；相关实验完整撤销，不扩大本次产品范围。

## Decision Log

2026-10-13 用户“同意。执行”批准上一轮方案，按标准脱敏、本地 ZIP、错误入口、JSON 降级范围执行；不提交/推送。

2026-10-15 用户明确要求“提交、推送。合并到 develop”，授权本次 Git 交付。按 OD-005 使用特性分支与 PR，等待 Governance、Static、Node、Browser、Build 五项远程门禁通过后合入；不部署、不发布。

## Validation

2026-10-14 本地交付验证：

- `./scripts/verify.sh static` 通过：治理 118 文档、网络边界、Lint、公共 TypeScript。计划归档后 `./scripts/verify.sh governance` 再次通过，索引与链接有效。
- `./scripts/verify.sh node` 全量 83 文件 / 852 测试通过；并行构建时登录限流的超时在低负载下复核通过，没有修改测试。
- `./scripts/verify.sh browser` 的第 1–7 批通过；第 8 批最初有两个入口体积断言失败。修正构建边界后，以相同排除项重跑 `npm test -- --exclude tests/drop-target-overlay.test.ts --shard=8/8`，131 文件 / 1402 测试通过；随后独立运行 `npm test -- tests/drop-target-overlay.test.ts`，11 测试通过。八批最终通过数合计 11012，加独立性能测试共 11023。未删除、放宽或跳过失败测试。
- 最终源代码专项复核：diagnostic collection/session/UI、rv-error-store、performance-loading 共 5 文件 / 41 测试通过。诊断专项自身共 29 项，覆盖采集、脱敏、控制台共存、取消与 JSON 降级。
- `RV_DEPLOYMENT_PROFILE=offline ./scripts/verify.sh build` 通过公共应用、access 与 demo-player 构建；存在既有大块体积提示。入口 `app-D5PjIl4A.js` 为 3519061 字符，诊断运行时 `diagnostics-runtime-lOyd5Ykc.js` 为 23311 字符，合计 3542372；原入口 3520000 字符预算和新增合计预算均通过。
- 对上述最终产物运行 `node scripts/run-offline-gate.mjs`，全部隔离网络旅程通过。诊断证据在 `test-results/diagnostics/production.json`（2026-10-14T12:53:01.557Z），网络总报告在 `test-results/offline/report.json`。真实 ZIP 含六个文件，范围排除、预览同一快照、敏感文本省略、390px 窄屏、键盘操作和真实 WebGL 上下文丢失均通过；诊断期间 1 个同源静态请求、0 个 Socket、0 个外部请求。
- 合成 100001 子节点，采集上限 100000 节点，本机一次测得 914ms；覆盖取消与让出主线程，不视为真实客户模型或硬件 GPU 性能承诺。

浏览器环境为 Linux ARM64 Chromium 145 / SwiftShader。真实 WebGPU、其他浏览器、移动设备、真实工业连接和远程 CI 未验证；本任务没有对真实设备执行写操作。

`npm run typecheck` 使用完整私有 tsconfig，因本 checkout 缺少私有 sibling 无法作为社区版门禁；按 Harness 执行 `./scripts/verify.sh static` 的公共 TypeScript 检查。该缺口不代表私有版已验证。

## Rollback

精确撤销本任务模块和接线，不覆盖用户改动；无持久化迁移或外部状态。

## Outcomes & Retrospective

L3-1 已完成本地开发与适用自动化验收；设置入口和故障入口均可由客户主动导出脱敏诊断包，ZIP 失败时降级为 JSON。默认不外发，无数据迁移。[客户与支持运行手册](../../runbooks/DIAGNOSTIC_BUNDLE.md) 与验收矩阵已同步。2026-10-14 本地交付时未提交或推送；2026-10-15 依用户追加授权进入 PR 交付，远程检查与合并结果以对应 PR 为准。

交付偏差仅涉及实现细节：为遵守既有入口预算而拆出诊断运行时，并修复生产旅程发现的故障遮罩层级；产品范围与原批准方案一致。运行时拆分没有减少总启动下载量，原有日志/告警状态所有权保持不变。未知自由文本按契约省略，因此支持人员需结合事件码、构建栈位置和摘要排障，无法从包中恢复原始客户日志。
