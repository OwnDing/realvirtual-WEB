---
doc_id: GOV-KNOWN-DEVIATIONS
title: 已知治理偏差登记
status: approved
owner: architecture
last_reviewed: 2026-11-04
authority: normative-registry
---

# 已知治理偏差登记

本登记记录“当前实现与 Approved 目标不一致、但尚未完成兼容迁移”的事实。登记不是豁免：新实现不得扩大偏差，关闭时必须提供文档、代码、迁移和验证证据。

| ID | 偏差与证据 | 受影响规则 | 当前围栏 | 关闭路径 | 状态 |
| --- | --- | --- | --- | --- | --- |
| KD-001 | 2026-08-21 关闭：用户可见文本曾大量散落，缺少正式目录、运行时与迁移门禁 | `GOV-CONSTITUTION` UI-1/UI-2 | 批准来源为用户 2026-08-21 当前明确指令；替代依据为 Approved `PS-I18N-001`、Accepted `ADR-0001` 和 Completed `EP-I18N-001` | 迁移覆盖批次 1–14；八类受门禁库存 1944 / 231 文件 → **0 / 0**，2415 条英文逐字追溯，Intl 未显式 locale 为 0，入口预算与 GitHub Actions run [`32507825623`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32507825623) 五项全绿留证。311 个错误消息候选保留为建议性分诊；真实 PLC/客户模型/生产连接、精简 kiosk 字体镜像和人工全界面 UX 未验证 | closed |
| KD-002 | Layout Planner 的部分 Snap 兼容逻辑仍从名称解析连接语义，名称承担了部分身份职责 | `GOV-CONSTITUTION` ID-1/ID-2 | 保持现有文件兼容；新 Schema 和新功能不得继续扩大名称身份依赖 | OD-004 决定稳定端口 ID/约束元数据与兼容迁移，随后建立 ADR、Schema 和 ExecPlan | open |
| KD-003 | 2026-11-04 关闭：原正式 embed 构建的引用解析器通过工作区项目查询带入 React/MUI（2026-10-11 按 Accepted [ADR-0015](../adr/ADR-0015-visual-presentation.md) 在独立库构建中裁掉该分支），但 `embed-spike.node.test.ts` 只在 `dist-embed/` 预先存在时执行，干净 CI 缺少强制证据 | `GOV-CONSTITUTION` AR-5/AR-6、`GOV-DOD` 工程验证 | 批准来源为用户当前明确指令（2026-11-03 第二轮整改第 3 步；2026-11-04“e2e plan……都进行，要测试的话就在本机上进行测试”）；替代依据为 Completed [EP-E2E-001](../exec-plans/completed/EP-E2E-001-attribute-fix-and-gate-e2e.md) 与 `GOV-HARNESS` 的 E2E Gate 条目 | CI `E2E Gate` 先构建正式 rv-embed 产物、在浏览器中运行 `embed-smoke`，再以 `RV_REQUIRE_EMBED_DIST=1` 强制运行 dist 守卫（产物缺失即失败；新增“输出不得残留 `process.env`”，首次运行即发现并修复产物加载报错）。自动化证据：PR #33 run [`41789510169`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41789510169)，`embed-smoke` 通过、守卫 6/6；`tests/e2e-gate.node.test.ts` 锁定该步骤。仍未验证：`E2E Gate` 不是 required check（OD-005），且只在维护者的自托管 runner 在线时运行；CDN 上的真实第三方页面嵌入未验证 | closed |

关闭偏差时必须记录日期、批准来源、替代文档、迁移范围、自动化证据和仍未验证的真实环境。
