---
doc_id: ACCEPTANCE-MATRIX
title: 全局验收追踪矩阵
status: draft
owner: qa
last_reviewed: 2026-08-18
authority: non-normative-until-populated
---

# 全局验收追踪矩阵

| Requirement | Rule/Contract | Automated Test | Runtime Evidence | Status |
| --- | --- | --- | --- | --- |
| 文档治理 | `DOC-INDEX`、`GOV-DOC-PRIORITY` | Governance Harness 自检与仓库扫描 | `./scripts/verify.sh governance` | automated-local |
| AI 文件/Git/进程安全 | `GOV-AI-SAFETY` | 危险 `.claude/commands` 模式扫描 | `./scripts/verify.sh governance` | automated-partial |
| Engine 导入边界 | `GOV-CONSTITUTION` AR-1 | ESLint boundaries +现有 Node guard | `./scripts/verify.sh static` | existing-automated |
| rv-ODT 一致性 | `schema/v1` | schema/spec/conformance 现有测试 | `npm run test:node` / focused tests | existing-needs-formal-mapping |
| MCP 文档漂移 | MCP decorators/generated fences | 现有 MCP docs drift tests | `npm run gen:mcp-docs` + focused tests | existing-automated |
| 多语言 | OD-002，待建产品规格和契约 | 待定 | 待定 | blocked-by-decision |
| 分层配置 | OD-003，待建配置契约 | 待定 | 待定 | blocked-by-decision |
| 稳定装配端口 | OD-004，待建 ADR/Schema | 现有 Snap 测试仅覆盖当前约定 | 待定 | current-behavior-only |
| Quality Gates | `GOV-HARNESS` | GitHub Actions workflow | 待首次远程运行和分支保护 | configured-pending-remote-run |

本矩阵在产品规格建立后继续细化；`draft` 表示当前仅是治理基线，不得据此声称多语言或平台化能力已经完成。
