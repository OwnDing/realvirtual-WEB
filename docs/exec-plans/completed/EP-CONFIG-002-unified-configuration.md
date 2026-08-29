---
doc_id: EP-CONFIG-002
title: 统一分层配置黄金切片
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-29
authority: normative
---

# EP-CONFIG-002：统一分层配置黄金切片

## Purpose

让交付者用版本化配置设置默认语言、工作区和功能策略，让用户能解释最终值，并消除项目 settings 污染用户偏好的路径。

## Scope

Deployment v2、Project Config v1、用户/会话迁移、四层 resolver/provenance、语言/ModeManager/插件策略接入、旧 bundle 内存 overlay、交付生成器、示例、Schema、测试与文档。

## Non-goals

不建设组织策略 Web UI/远程配置服务；不把工业信号、GLB/rv_extras 或文档事实塞入通用配置；不重做全部设置页；不发布、部署或写真实设备。

## Required Documents and Decisions

用户于 2026-08-29 明确批准实施；Approved `PS-CONFIG-001/002`、Accepted `ADR-0006/0008`、`CONTRACT-DEPLOYMENT-CONFIG-001` 与 `CONTRACT-UNIFIED-CONFIG-001`。

## Current Repository Facts

起点 `develop`、工作树干净，实施分支 `codex/unified-config-layer`。已有 Deployment Config v1/零外呼；i18n 先于 settings fetch；ModeManager 使用全局 `rv-active-mode`；项目 settings 会调用用户 import；客户生成器仍输出无版本 legacy settings。

## State Ownership and Compatibility

部署快照与项目文件只读，用户状态写版本化 localStorage 并兼容双写，session 只在内存。旧 deployment v1、settings bundle、语言/mode/plugin key 可读；不修改 GLB、项目 manifest 或场景格式。

## Allowed Paths

- `src/core/config/**`, `src/core/deployment/**`, `src/core/i18n/**`
- `src/core/rv-app-config.ts`, `src/core/rv-mode-manager.ts`, `src/core/rv-viewer.ts`, `src/core/project/**`, `src/core/hmi/**`, `src/main.ts`
- `schema/**`, `public/settings*.json`, `scripts/**`, `tests/**`, `docs/**`

## Forbidden Paths

- 客户模型、真实 PLC/接口、生产地址、密钥；generated 文件的手工修改；提交、推送、发布与部署。

## Milestones

1. 冻结文档、字段目录、Schema 与纯迁移/解析器。
2. 接入 locale、workspace、feature policy 和用户兼容迁移。
3. 项目/模型 legacy overlay 无污染迁移与 owner 清理。
4. 更新交付生成器/示例并通过聚焦与综合门禁。

## Progress

- [x] 用户批准决策、建立实施分支与规范文档。
- [x] M1 Schema、迁移、resolver/provenance。
- [x] M2 运行时接入与持久化迁移。
- [x] M3 项目/模型兼容 overlay。
- [x] M4 交付与验证。

## Surprises & Discoveries

- 当前 `public/settings.json` 已是 v1 安全黄金切片，不是最初问题描述中的两字段文件。
- `?lockSettings=false` 当前可放宽部署锁，必须改为只能收紧。
- 私有 sibling 不在本 checkout，完整客户交付只能验证公共生成逻辑和失败行为。

## Decision Log

- 2026-08-29：用户批准双平面优先级、部署快照、项目 modelProfiles 与禁止客户源码 fork。
- 2026-08-29：版本采用 Deployment v2 + Project Config v1，v1 deployment 保留为已发布契约。

## Validation

聚焦 Node/browser 测试；`./scripts/verify.sh governance`、`static`、`node`、`browser`、`build`，风险允许时 `all`；浏览器工作区/语言黄金旅程。记录缺失私有 sibling 和未验证真实环境。

## Rollback

回退实现即可；v2 字段会被旧客户端忽略，旧 key 因双写仍可读。未执行外部写入，无外部状态需撤销。

## Outcomes & Retrospective

已交付 Deployment Config v2 与 Project Config v1 Schema、双平面 resolver/provenance/rejection、稳定 model profile、版本化用户 scope 和会话 allowlist；locale、ModeManager 与插件策略均消费同一有效快照，惰性插件会刷新 capability。旧项目/模型 bundle 改为内存 overlay，不再污染用户 localStorage；客户生成器输出 v2 配置并保留精确密钥路径扫描。

验证：governance/static/build 通过；Node 702 通过、7 跳过，剩余 1 项为既有 `bundle-chunk` 入口命名偏差；本计划范围复测全绿。客户生成器 50 通过、1 跳过。Browser 八分片 10,909 通过，独立性能 11/11；avatar 微基准一次超时后单测与完整分片复跑均绿。未验证真实客户内网/生产部署、真实 PLC、远程组织策略服务和人工多浏览器 UX。未提交、推送、发布或部署。
