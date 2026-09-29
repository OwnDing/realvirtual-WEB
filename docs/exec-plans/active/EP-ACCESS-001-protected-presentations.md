---
doc_id: EP-ACCESS-001
title: L2-1 受保护演示访问控制
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-09-29
authority: normative-process
---

# EP-ACCESS-001：受保护演示访问控制

## Purpose

管理员在客户 Appliance 发布受保护演示、分发限时链接并撤销；访客只能读取授权快照，访问可审计。

## Scope

本地账户、SQLite 会话和资源授权、GLB 发布预检、访客查看/水印/截图、管理 UI、到期撤销、审计、Caddy 路由、安装备份恢复、旧登录迁移、文档测试和 PR。

## Non-goals

组织/多租户/SSO、云端项目后端、工业写控制、远程撤销离线导出包、DRM。多文件依赖首版明确拒绝并指导打包为自包含 GLB。

## Required Documents and Decisions

[开发宪法](../../governance/DEVELOPMENT_CONSTITUTION.md)、[AI 安全](../../governance/AI_SAFETY.md)、[文档优先级](../../governance/DOCUMENT_PRIORITY.md)、[OD-001](../../governance/OPEN_DECISIONS.md)、[产品规格](../../product-specs/PROTECTED_PRESENTATIONS.md)、[ADR-0012](../../adr/ADR-0012-protected-presentations.md)、[API 契约](../../contracts/PROTECTED_PRESENTATIONS.md)、既有 ADR-0009/0010/0011 与 Appliance 契约。旧 persistence/lifecycle/plugin/UI 文档按 reference 交叉验证。

## Current Repository Facts

初始 develop 工作树干净且落后七个提交；fetch 后从 origin/develop 建立 codex/l2-access-control。Node v22.22.2，Appliance 锁定 Node 24；旧登录实际使用 localStorage，与 sessionStorage 注释不符。Caddy 已有运维 Basic Auth。现有分享服务端不在本仓库。PWA 已禁用。

## State Ownership and Compatibility

新增 data/access 持有服务器权限数据库与模型；不改 GLB、NodeId、项目和文档格式。SQLite v1 登记于发行兼容声明，恢复后全量使链接/会话失效。旧公开分享契约和加密 GLB 保持兼容。

## Allowed Paths

- appliance/**、src/access/**、src/plugins/login-gate-plugin.tsx、src/core/i18n/**
- 专用 HTML/Vite 构建入口、必要构建/验证脚本与 package.json
- tests/**、e2e/**、docs/**、CI 门禁

## Forbidden Paths

- 客户模型/Secret、工业信号方向与写逻辑、生成文档围栏、生产部署

## Milestones

1. 文档与 Accepted ADR；创建 draft PR。
2. 服务端账户/会话/发布/读取/撤销黄金切片，先建立绕过负例测试。
3. 管理与访客 UI、embed 引擎、水印、错误与失效生命周期。
4. Caddy 与安装/备份/恢复、真实入口 E2E 和回归门禁。
5. 审查修正、更新交付证据、PR ready 与 CI 全绿。

## Progress

- [x] 用户批准方案及提交、推送、PR；建立功能分支。
- [x] 写入规格、ADR、契约和活动计划。
- [ ] 服务端与安全测试。
- [ ] UI 与浏览器闭环。
- [ ] 部署/恢复集成。
- [ ] 门禁、审查和 PR。

## Surprises & Discoveries

已有 RVEmbedViewer 提供公开引擎和固定步长仿真，且不依赖工作台/工业接口，可用作访客展示入口。首版资源闭环限制为自包含 GLB，外部依赖拒绝符合已批准预检行为。

## Decision Log

2026-09-29：用户明确批准上一轮方案并要求实施至功能可用、写入 docs 和创建 PR。OD-001 仅落地私有化演示子范围，不关闭组织平台的剩余决策。

## Validation

governance/static/node/browser/build；真实 Caddy + 控制面 + 浏览器发布/访问/撤销；CSRF、会话伪造、跨资源、路径/Range、到期/禁用、重启/恢复、限速/配额/错误行为；公共构建和 CI。

## Rollback

保留权限与模型状态；不支持 access 持久格式的旧版本拒绝直接回滚。恢复备份后所有链接与会话失效。未授权部署，测试使用本地隔离 fixture。

## Outcomes & Retrospective

实施中；尚未声明自动化或真实客户环境验证通过。
