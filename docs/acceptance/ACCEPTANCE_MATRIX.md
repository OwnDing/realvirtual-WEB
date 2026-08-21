---
doc_id: ACCEPTANCE-MATRIX
title: 全局验收追踪矩阵
status: draft
owner: qa
last_reviewed: 2026-08-21
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
| 稳定装配端口 | OD-004，待建 ADR/Schema | 现有 Snap 测试仅覆盖当前约定 | 待定 | current-behavior-only |
| Quality Gates | `GOV-HARNESS`、`EP-GOV-003` | GitHub Actions workflow；名称探测终止、包体积与完整 Browser 回归 | 本地 governance/static/node/build 通过；Browser 944 files、10,366 tests 通过；远程 run 32222458677 的五个 Gate 全部通过，Chromium 安装 8 秒、Browser Harness 7 分 17 秒；`main`/`develop` 无 branch protection/ruleset | automated-local-and-remote-not-enforced |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
