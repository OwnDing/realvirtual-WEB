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
| 多语言 | Closed OD-002、Approved `PS-I18N-001`、Accepted `ADR-0001`；`zh-CN`/`en-US`、默认中文、AI 直接翻译 | `tests/i18n-inventory.node.test.ts`（增量债务门禁）、`tests/i18n-test-locale-pin.node.test.ts`（测试 locale 固定）、`i18n-runtime`/`i18n-catalog`/`i18n-preboot` Node 套件、`tests/i18n-golden-slice.test.tsx` + `tests/i18n-settings.test.tsx` + `tests/i18n-shell.test.tsx` + `tests/i18n-connect.test.tsx` + `tests/i18n-operator.test.tsx` + `tests/i18n-authoring.test.tsx` + `tests/i18n-assets.test.tsx` + `tests/i18n-sim.test.tsx` + `tests/i18n-demo.test.tsx` + `tests/i18n-catalog-split{,-failure}.test.ts` Browser 套件、`scripts/i18n-verbatim-check.mjs` | Projects Dashboard、Settings 面板、常驻 HMI 外壳、CONNECT 工业连接流程、操作员运行时面、创作/检查器工作面、资产生命周期、离散事件仿真/物料流与演示 HMI/存储通知（KPI 条、消息卡片、机器人报警与 AI 助手、浏览器存储横幅）可切换（批次 9，2026-08-20）；PLC 型号与协议名按 ADR-0001 §6 保持英文并有测试钉住；批次 5 把同一规则扩到单位与国际通用缩写（MTBF/MTTR/NPSH/DN/pH/ΔP），批次 6 再扩到编译器认的标识符（`import`/`export`、`setup(self)`、`ApiVersion`、`WebComponent`）——两批都配了反向用例，证明周围的散文确实翻译了；本地 static + node（55 文件 / 503 例）+ build 通过，受门禁债务 1858 → **283 / 67 文件**；`ADR-0001` R1 已批准并实施：`en-US` 的 7 个非启动 namespace 移入独立 chunk（70.7 KB），`zh-CN` 全量留在入口作为回退，入口预算未放宽（3_449_610 B / 3_520_000 B，**余 68.7 KB，按每批 4–11 KB 递减**——预算见底前需要一次新的决定，见 EP-I18N-001）；pre-boot 首屏已按 ADR-0001 §11 修复（shell 出默认语言，内联 classic script 换英文；Milestone 3 的相关结论已更正）；`scripts/i18n-verbatim-check.mjs` 在批次 5 的反例中被证明**失败时不返回**（三处正则缺陷），已修复并在批次 6 补上第四个盲点（`\uXXXX` 转义写法）——此前各批次的通过结论仍然成立，恢复的是报告失败的能力；两个随目录增长而变慢的 Node 门禁已改为显式 60 s 超时，避免超时被读成回归；盘点门禁的非空洞判据在批次 9 从「finding 数下限」改为 `filesScanned > 500`（遍历确实发生），因为绝对下限每批都要下调、且在债务归零时必须删除——那会让门禁在代码库最干净时最弱；完整 Browser 门禁仍受无头 Chromium 的 WebGL 上下文耗尽阻塞（本机 22 文件 / 82 例，与批次 4 修复后的基线**逐文件完全一致**；失败输出中文出现次数为 0；i18n 专项套件单独全绿），尚未在有 GPU 的环境复验 | batch-9-local-browser-gate-blocked |
| 分层配置 | OD-003，待建配置契约 | 待定 | 待定 | blocked-by-decision |
| 稳定装配端口 | OD-004，待建 ADR/Schema | 现有 Snap 测试仅覆盖当前约定 | 待定 | current-behavior-only |
| Quality Gates | `GOV-HARNESS`、`EP-GOV-003` | GitHub Actions workflow；名称探测终止、包体积与完整 Browser 回归 | 本地 governance/static/node/build 通过；Browser 944 files、10,366 tests 通过；远程 run 32222458677 的五个 Gate 全部通过，Chromium 安装 8 秒、Browser Harness 7 分 17 秒；`main`/`develop` 无 branch protection/ruleset | automated-local-and-remote-not-enforced |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
