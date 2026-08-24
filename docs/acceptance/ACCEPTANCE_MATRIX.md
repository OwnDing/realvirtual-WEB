---
doc_id: ACCEPTANCE-MATRIX
title: 全局验收追踪矩阵
status: draft
owner: qa
last_reviewed: 2026-08-24
authority: proposed
---

# 全局验收追踪矩阵

| Requirement | Rule/Contract | Automated Test | Runtime Evidence | Status |
| --- | --- | --- | --- | --- |
| 文档治理 | `DOC-INDEX`、`GOV-DOC-PRIORITY` | Governance Harness 自检、元数据/索引/链接/状态扫描 | `./scripts/verify.sh governance`；远程 run 32151338635 的 Governance Gate 通过 | automated-local-and-remote |
| AI 文件/Git/进程安全 | `GOV-AI-SAFETY` | Agent 可执行指令面扫描 + Claude deny 配置校验 | `./scripts/verify.sh governance` | automated-partial |
| Engine 导入边界 | `GOV-CONSTITUTION` AR-1 | ESLint boundaries +现有 Node guard | `./scripts/verify.sh static` | existing-automated |
| rv-ODT 一致性 | `schema/v1` | schema/spec/conformance 现有测试 | `npm run test:node` / focused tests | existing-needs-formal-mapping |
| MCP 文档漂移 | MCP decorators/generated fences | 现有 MCP docs drift tests | `npm run gen:mcp-docs` + focused tests | existing-automated |
| rv-embed 依赖隔离 | `GOV-CONSTITUTION` AR-5/AR-6、KD-003 | `embed-spike.node.test.ts`（仅已有 `dist-embed/` 时运行） | 正式 embed build 当前会触发 React/MUI forbidden marker | known-deviation-not-ci-enforced |
| 多语言 | Closed OD-002、Approved `PS-I18N-001`、Accepted `ADR-0001`、Completed `EP-I18N-001`；`zh-CN`/`en-US`、默认中文、AI 直接翻译 | 零库存盘点与 locale pin Node 门禁；运行时/目录/pre-boot/分包 Node 套件；全迁移面 Browser 回归；`scripts/i18n-verbatim-check.mjs`；入口预算断言 | 批次 1–14 覆盖 Projects、Settings、Shell、CONNECT、Operator、Authoring、Assets、DES/物料流、Demo、Agents/Planner、AAS、运行时指令、信号绑定、插件注册、pre-boot、FPV 与 WebXR DOM/CanvasTexture。八类受门禁散落文案从 1944 / 231 文件降为 **0 / 0**，硬零守卫防止刷新非零基线；2415 条 `en-US` 值逐字追溯，22 个 Intl 格式化站点全部显式传 locale。工业型号、协议名、单位、稳定 ID、资源键与线上值按 ADR-0001 §6 保持原样。入口预算未放宽（**3_466_216 / 3_520_000 B**，余 **53_784 B / 52.5 KiB**），`zh-CN` 全量留在入口，8 个非启动 `en-US` namespace 位于 **87_532 B** deferred chunk。本地 static、Node、build 与聚焦 Browser 通过；GitHub Actions run [`32507825623`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32507825623) 五项全绿，Browser 合计 962 文件 / 10,491 例。本机全量仍受 WebGL 上下文耗尽限制；真实 PLC/客户模型/生产连接、精简 kiosk 字体镜像和人工全界面 UX 巡检未验证 | completed-automated-remote |
| 分层配置 | OD-003，待建配置契约 | 待定 | 待定 | blocked-by-decision |
| 可手工组装涂装线与稳定端口 | Closed OD-004、Accepted `ADR-0003`、`CONTRACT-ASSEMBLY-PORTS-001`、rv-ODT 1.1、Approved `PS-PLANNER-001` | 稳定端口、目录、16 个 Paint Line 资产、拓扑/工艺行为共 109 个聚焦单元与 Node 用例；Playwright 黄金流程 1 例 | 本部署显式订阅目录；真实 Library HTML5 拖入喷房，PortId 组装四段闭环，运行后位置递增、`PaintedPieces > 0` 且实际工件材质变色；真实 `rv-layout-autosave` 经启动同路径冷重建后 5 个布局 ID、闭环、运行和喷涂恢复；生成器双跑 SHA-256 一致。物理页面刷新与全量 Browser 受本机 SwiftShader 上下文耗尽限制，正式项目文档保存、真实 PLC/GPU 性能和人工视觉未验证 | completed-local-with-environment-deviation |
| 智能资产编辑器 | Approved `PS-ASSET-001`、Accepted `ADR-0004`、Completed `EP-ASSET-001`、`CONTRACT-ASSEMBLY-PORTS-001` | 9 个聚焦模型/插件/保存测试；65 个 rv-ODT 规格测试；MCP drift 20；Playwright 黄金流程 1/1；governance/static/node/build 通过；全量 Browser 的 LFS/SwiftShader 偏差见 ExecPlan | 公开 Editor 完成新建/打开/导入、端口/涂装行为/六类信号、可定位校验、统一保存/另存为、Library 刷新；E2E 发布 `library/Custom` 后文档 clean | completed |
| 公开、行业无关 DES | Approved `PS-DES-001`、Accepted `ADR-0005`、Completed `EP-DES-001`、`CONTRACT-DES-RUNTIME-001` | 公开 DES 架构门禁；68 个 DES Browser 文件 / 366 例中 365 例（1 例失败，2026-08-23 由 `EP-DES-002` 修复，见该行末尾）；Node、i18n、入口分包断言；Library/Planner → 稳定端口 → FastForward → 诊断/KPI → `rv-layout-autosave` 重开复现 Playwright | 公开构建注册真实 runner；事件/MU/组件/故障/快照/实验/批处理/运行历史均位于公开路径，公共 DES 测试不再依赖 `@rv-private`，仅 Toray 项目测试保持项目排除。100k/1M 事件、500/5,000 组件和 5k/10k MU 已建立本机基线；入口预算未放宽（3,516,780 / 3,520,000 B），runner 按首次 DES 进入加载。governance/static/Node/build、聚焦 Browser/E2E 通过；本机全量 Browser 的 `tests.glb` Git LFS 指针与 SwiftShader 上下文耗尽偏差见 ExecPlan。真实 PLC/MQTT、客户模型、生产连接、多浏览器/GPU 与人工 UX 未验证。**2026-08-23 由 Completed [`EP-DES-002`](../exec-plans/completed/EP-DES-002-public-des-hardening.md) 加固**：修复快照恢复原子性与动作预注册、显式 `routeIndex` 被满载下游改道、运行时生命周期泄漏、稳定端口在缩放父链下的方向取值，并把只处理 1 个事件的参考负载改为真实事件流（12,196 事件）；受影响 Browser 范围全绿；随后关闭具名债务（删除 16 个 re-export shim、agv 套件迁入公开 runner）并补修 3 个既有缺陷（`registerTweenSpec` 不解析 `pathRef`、事件队列 overlay 从未注册、`smart-asset-editor` E2E 缺软件 GL 参数导致断言从未执行）。`tests/des/` + `tests/path/` 85 文件 / 529 例全绿；全量 Browser 1,031 文件中 22 失败、10,869 例中 82 失败，全部为 headless SwiftShader 上下文偏差且在 `f012911` 同样复现（`EP-DES-001` 对 `embed-*` 的 LFS 归因经复核不成立，已更正）；Playwright 公开黄金流程 3/3；入口 3,508,771 / 3,520,000 B（`assetsInlineLimit` 停止内联 `.glb`，拿回 8,326 B，入口 base64 归零；预算未提高）| completed-local-with-environment-deviation |
| Quality Gates | `GOV-HARNESS`、`EP-GOV-003`、[`EP-GOV-004`](../exec-plans/active/EP-GOV-004-gate-that-gates.md) | GitHub Actions 五项独立 Gate；名称探测终止、runner 结构自检、包体积与完整 Browser 回归 | M1 已让本机/CI 使用同一 Chrome for Testing，本机全量 1,028/1,031 文件、10,860 例通过、零失败，隔离性能套件 11/11；run `32616661537` 五项全绿。OD-005 已关闭：`main`/`develop` 均要求 Governance、Static、Node、Browser、Build，`strict`、管理员不可绕过、禁止强推/删除。M4 保持 Browser required、全量、无 retry/`continue-on-error`。四分片在 PR #4 run `32732754539` 于单进程约 258 个文件处再次复现 runner 丢失，且无断言失败、资源充足；现收紧为八个顺序独立 shard（单进程约 129 文件），性能套件第九个进程运行。最终方案两轮本地完整门禁通过；实现提交 `ac769d4` 的 run [`32735488742`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32735488742) attempts 1/2/3 五项 Gate 连续全绿，Browser 为 12:57 / 9:53 / 16:36 | automated-local-and-remote-enforced |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
