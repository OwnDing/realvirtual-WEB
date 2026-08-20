---
doc_id: ACCEPTANCE-MATRIX
title: 全局验收追踪矩阵
status: draft
owner: qa
last_reviewed: 2026-08-20
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
| 多语言 | Closed OD-002、Approved `PS-I18N-001`、Accepted `ADR-0001`；`zh-CN`/`en-US`、默认中文、AI 直接翻译 | 增量盘点与 locale pin Node 门禁；运行时/目录/pre-boot Node 套件；黄金切片、Settings、Shell、CONNECT、Operator、Authoring、Assets、Sim、Demo、Tools、目录分包 Browser 套件；`scripts/i18n-verbatim-check.mjs` | 批次 1–11 已覆盖 Projects、Settings、常驻外壳、CONNECT、操作员面、创作/检查器、资产生命周期、DES/物料流、演示 HMI/存储、AI 代理/布局规划器、AAS、运行时指令和信号绑定流程。工业型号、协议名、单位、通用缩写、编译器标识符与线上值按 ADR-0001 §6 保持原样，周围散文可切换。本地 static、Node（55 文件 / 503 例）、build、受影响 Browser（11 文件 / 121 例）和 bundle-splitting（14 例）通过；受门禁债务 1944 → **129 / 46 文件**，2277 条 `en-US` 值可逐字追溯。`ADR-0001` R1 已将 8 个非启动 `en-US` namespace 移入独立 chunk（80_324 B），`zh-CN` 全量留在入口；预算未放宽（3_458_596 / 3_520_000 B，余 **61_404 B / 60.0 KB**），按当前密度可在预算内收尾，但提高预算或重新权衡中文是否整体留在入口的决定仍未消失。pre-boot 首帧已按 §11 修复；完整 Browser 门禁仍受本机无头 Chromium 的 WebGL 上下文耗尽阻塞，尚未在有 GPU 的环境复验 | batch-11-local-browser-gate-blocked |
| 分层配置 | OD-003，待建配置契约 | 待定 | 待定 | blocked-by-decision |
| 稳定装配端口 | OD-004，待建 ADR/Schema | 现有 Snap 测试仅覆盖当前约定 | 待定 | current-behavior-only |
| Quality Gates | `GOV-HARNESS`、`EP-GOV-003` | GitHub Actions workflow；名称探测终止、包体积与完整 Browser 回归 | 本地 governance/static/node/build 通过；Browser 944 files、10,366 tests 通过；远程 run 32222458677 的五个 Gate 全部通过，Chromium 安装 8 秒、Browser Harness 7 分 17 秒；`main`/`develop` 无 branch protection/ruleset | automated-local-and-remote-not-enforced |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
