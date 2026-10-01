---
doc_id: EP-ACCESS-001
title: L2-1 受保护演示访问控制
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-10-01
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

- appliance/**、src/access/**、src/plugins/login-gate-plugin.tsx、src/core/i18n/**、src/embed/rv-embed-viewer.ts
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
- [x] 服务端与安全测试：会话、CSRF、逐资源读取、限速、配额、错误关闭及并发授权复查。
- [x] UI 与浏览器闭环：独立访客入口、管理页面、中英文、水印和截图。
- [x] 部署/恢复集成：私有卷、安装生成配置、格式登记和恢复失效。
- [x] 门禁、审查和 PR：功能提交 05e2bab 的 Quality Gates #96 五项全绿；PR #11 已转为 Ready for review。

- [x] 2026-10-01 PR 后续审查：复现并修复登录门禁卸载遗留的待定加载；新增取消/重装/迟到响应回归通过，后续门禁结果见 Validation。

## Surprises & Discoveries

已有 RVEmbedViewer 提供公开引擎和固定步长仿真，且不依赖工作台/工业接口，可用作访客展示入口。首版资源闭环限制为自包含 GLB，外部依赖拒绝符合已批准预检行为。

真实 Caddy 测试发现默认指令排序会让静态回退先改写路径，现使用显式 route 顺序并验证工作台/CONNECT/MCP/Git/Influx 均不可被访客访问。全量 Node 测试发现语言目录的格式与既有提取器不匹配，已改为仓库惯例并登记经批准的新文案；未修改测试断言或放宽门禁。

另补充下载槽位（四个，保持至 I/O 结束且响应完成/关闭）和断连请求错误处理；13 项服务端回归覆盖慢连接、配额及上传中断后的恢复。链接在同标签页仅改变 fragment 时需要重新启动兑换流程，该浏览器缺陷已修正并回归。

2026-10-01 PR 审查发现旧登录适配器在销毁时丢弃 loadGate resolver，导致已等待的 loadModel 永久挂起；重复安装同样会遗留旧门禁。新增取消路径以 AbortError 拒绝等待，既结束加载又不在未认证时进入解析；预注册 rejection handler 处理消费者尚未开始等待的情况，且保留原 Promise 的拒绝。认证结果同时检查生命周期代次，阻止迟到响应放行新门禁。

## Decision Log

2026-09-29：用户明确批准上一轮方案并要求实施至功能可用、写入 docs 和创建 PR。OD-001 仅落地私有化演示子范围，不关闭组织平台的剩余决策。

## Validation

2026-09-29 本地证据：

- `./scripts/verify.sh governance`、`./scripts/verify.sh static`、`./scripts/verify.sh build` 通过；没有修改锁文件或安装新依赖。
- `./scripts/verify.sh node`：75 个文件、769 项通过，7 项既有条件跳过；新增慢下载和中断上传后，`vitest run --config vitest.node.config.ts tests/access-control.node.test.ts` 的 13 项全部通过。最终功能版本的 CI Node Gate 通过 769 项，9 项为既有条件跳过（CI Node job 不预构建 dist，故比本机额外跳过 2 项产物检查）。
- `node scripts/test-protected-presentations.mjs`：真实 Caddy 2.11.4 HTTPS + Node/SQLite + Chromium 通过发布、匿名/指定账户、同标签页换链接、刷新恢复、伪造 Cookie/localStorage、资源与运维隔离、Range、水印截图、撤销和断网清场；证据 `test-results/access/result.json` 及 PNG，由 CI 上传。
- 浏览器全量门禁的 1–7/8 分片通过；最后分片发现旧登录遮罩的 blur 样式被移除，已恢复兼容样式。宿主随后以 SIGTERM 中断了该次执行，按相同 Harness 环境恢复运行第 8 分片并通过 1398 项；独立性能用例在本地和最终 CI 均通过 11 项，没有修改测试门槛。

功能提交 `05e2bab4318f18ddd9e2a0fda1d8639ae5a9c782` 的 [Quality Gates #96](https://github.com/OwnDing/realvirtual-WEB/actions/runs/36526377326) 五项全部通过。Browser Gate 包含隔离离线旅程、真实受保护演示 HTTPS 场景、八个全量分片和独立性能测试，共 10941 项浏览器测试通过；12 项 skip、2 项 todo 为仓库既有状态，没有新增跳过。运行产物 `protected-presentation-evidence` 与 `offline-gate-evidence` 提供真实入口证据。2026-09-30 完成 PR 描述与计划归档，归档不改功能代码。

2026-10-01 审查后续：新增 `tests/login-gate-lifecycle.test.tsx`，修复前 6 项失败、1 项通过；修复后 7 项全通过，包含真实 RVViewer 的插件移除/Viewer 销毁取消、管理员放行、访客及分享作用域拒绝、门禁替换/迟到响应、提前取消与销毁后拒绝复用。与 `tests/i18n-shell.test.tsx` 合跑共 13 项通过；本次修复的 `./scripts/verify.sh static`（含 governance、Lint 和公共类型检查）与 `./scripts/verify.sh build` 均通过。此前归档提交 `907a788` 的 [Quality Gates #97](https://github.com/OwnDing/realvirtual-WEB/actions/runs/36649199846) 五项通过；本次修复的最终远程门禁记录于 PR #11。

验收矩阵与运维步骤见 [RUNBOOK-ACCESS-001](../../runbooks/PROTECTED_PRESENTATIONS.md)。实际部署、Windows 安装、客户真实大模型、移动浏览器和真实 PLC 不在这次验证中。

## Rollback

保留权限与模型状态；不支持 access 持久格式的旧版本拒绝直接回滚。恢复备份后所有链接与会话失效。未授权部署，测试使用本地隔离 fixture。

## Outcomes & Retrospective

已交付并打开可评审 [PR #11](https://github.com/OwnDing/realvirtual-WEB/pull/11)，未合并或部署。账户、发布、分享、逐请求授权、水印、审计、撤销/禁用/到期、断网清场、安装/恢复及迁移文档组成可验证闭环，功能提交五项 CI 门禁全绿。

偏差与边界：首版按批准范围只接受自包含 GLB，拒绝外部资源与脚本，不提供组织/多租户/SSO、离线远程撤销或 DRM。已下载字节无法收回。Windows/真实客户大模型/移动端与生产网络留给部署方验收；权限状态的回滚和恢复限制见上节及运行手册。
