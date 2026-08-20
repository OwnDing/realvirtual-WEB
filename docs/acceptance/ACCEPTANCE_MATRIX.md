---
doc_id: ACCEPTANCE-MATRIX
title: 全局验收追踪矩阵
status: draft
owner: qa
last_reviewed: 2026-08-19
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
| 多语言 | Closed OD-002、Approved `PS-I18N-001`、Accepted `ADR-0001`；`zh-CN`/`en-US`、默认中文、AI 直接翻译 | `tests/i18n-inventory.node.test.ts`（增量债务门禁）、`tests/i18n-test-locale-pin.node.test.ts`（测试 locale 固定）、`i18n-runtime`/`i18n-catalog`/`i18n-preboot` Node 套件、`tests/i18n-golden-slice.test.tsx` + `tests/i18n-settings.test.tsx` + `tests/i18n-shell.test.tsx` + `tests/i18n-connect.test.tsx` Browser 套件、`scripts/i18n-verbatim-check.mjs` | Projects Dashboard、Settings 面板、常驻 HMI 外壳与 CONNECT 工业连接流程可切换（批次 4，2026-08-20）；PLC 型号与协议名按 ADR-0001 §6 保持英文并有测试钉住；本地 static + node（500 例）+ build 通过，受门禁债务 1858 → 948，入口 chunk 累计净增 165.5 KB，预算仅余 63.3 KB（后续批次前需先决定非启动 namespace 是否分包）；pre-boot 首屏已按 ADR-0001 §11 修复（shell 出默认语言，内联 classic script 换英文；Milestone 3 的相关结论已更正）；完整 Browser 门禁受无头 Chromium 的 WebGL 上下文耗尽阻塞，失败计数每次运行都不同（本机 22 文件 / 82 例，外部评审同期 27/87），不变量是「失败集中在需 WebGL 的那一组、失败输出中文出现次数为 0、i18n 专项套件单独全绿」，尚未在有 GPU 的环境复验 | batch-4-local-browser-gate-blocked |
| 分层配置 | OD-003，待建配置契约 | 待定 | 待定 | blocked-by-decision |
| 稳定装配端口 | OD-004，待建 ADR/Schema | 现有 Snap 测试仅覆盖当前约定 | 待定 | current-behavior-only |
| Quality Gates | `GOV-HARNESS`、`EP-GOV-003` | GitHub Actions workflow；名称探测终止、包体积与完整 Browser 回归 | 本地 governance/static/node/build 通过；Browser 944 files、10,366 tests 通过；远程 run 32222458677 的五个 Gate 全部通过，Chromium 安装 8 秒、Browser Harness 7 分 17 秒；`main`/`develop` 无 branch protection/ruleset | automated-local-and-remote-not-enforced |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
