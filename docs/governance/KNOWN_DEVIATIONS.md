---
doc_id: GOV-KNOWN-DEVIATIONS
title: 已知治理偏差登记
status: approved
owner: architecture
last_reviewed: 2026-08-21
authority: normative-registry
---

# 已知治理偏差登记

本登记记录“当前实现与 Approved 目标不一致、但尚未完成兼容迁移”的事实。登记不是豁免：新实现不得扩大偏差，关闭时必须提供文档、代码、迁移和验证证据。

| ID | 偏差与证据 | 受影响规则 | 当前围栏 | 关闭路径 | 状态 |
| --- | --- | --- | --- | --- | --- |
| KD-001 | 2026-08-21 关闭：用户可见文本曾大量散落，缺少正式目录、运行时与迁移门禁 | `GOV-CONSTITUTION` UI-1/UI-2 | 批准来源为用户 2026-08-21 当前明确指令；替代依据为 Approved `PS-I18N-001`、Accepted `ADR-0001` 和 Completed `EP-I18N-001` | 迁移覆盖批次 1–14；八类受门禁库存 1944 / 231 文件 → **0 / 0**，2415 条英文逐字追溯，Intl 未显式 locale 为 0，入口预算与 GitHub Actions run [`32507825623`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/32507825623) 五项全绿留证。311 个错误消息候选保留为建议性分诊；真实 PLC/客户模型/生产连接、精简 kiosk 字体镜像和人工全界面 UX 未验证 | closed |
| KD-002 | Layout Planner 的部分 Snap 兼容逻辑仍从名称解析连接语义，名称承担了部分身份职责 | `GOV-CONSTITUTION` ID-1/ID-2 | 保持现有文件兼容；新 Schema 和新功能不得继续扩大名称身份依赖 | OD-004 决定稳定端口 ID/约束元数据与兼容迁移，随后建立 ADR、Schema 和 ExecPlan | open |
| KD-003 | 正式 `vite.embed.config.ts` 构建会生成包含 React/MUI 标记的动态 chunk；`embed-spike.node.test.ts` 只在 `dist-embed/` 预先存在时执行，因此干净 Node CI 会跳过该证据 | `GOV-CONSTITUTION` AR-5/AR-6、`GOV-DOD` 工程验证 | 不把当前 Node/公共 Build 绿色表述为 rv-embed 隔离已验证；保持现有 guard，不删除或放宽断言 | 建立独立 rv-embed ExecPlan，先冻结入口/动态 chunk 预期，再修依赖闭包并把“构建 + guard”接入独立 CI gate | open |

关闭偏差时必须记录日期、批准来源、替代文档、迁移范围、自动化证据和仍未验证的真实环境。
