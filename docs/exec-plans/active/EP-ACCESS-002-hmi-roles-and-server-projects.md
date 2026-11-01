---
doc_id: EP-ACCESS-002
title: 缺口整改第 3 步：HMI 四级角色、写操作审计与 Forgejo 服务端项目
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-01
authority: normative-process
---

# EP-ACCESS-002：缺口整改第 3 步：HMI 四级角色、写操作审计与 Forgejo 服务端项目

## Purpose

完成后，Appliance 上每个使用 HMI 的人都有个人账户：viewer 只能看，operator 能写 PLC 信号，engineer 能强制信号并保存服务端项目，admin 管理账户与审计。每一次 PLC 写入（含被拒绝的）都能回答“谁、何时、写了什么”；项目集中保存在 Appliance 的 Forgejo，每次保存是一次带用户名的提交。

## Scope

- 访问服务：角色扩展与 v1→v2 迁移、`/authz`（Caddy `forward_auth`）、`/audit-events`、`/api/projects/v1`（Forgejo 代理）。
- 入口：HMI 面改为会话保护，IT 面保留 operator Basic Auth，剥离客户端身份头，`/login/` 登录页。
- 网关：`trustProxyIdentity`，按角色拒绝写入，审计记录用户/角色。
- 安装器：缺少 admin 时以 operator 凭据引导 HMI 管理员；签发 Forgejo 项目服务令牌；网关默认信任入口身份。
- 浏览器：会话状态与能力映射、账户标识与退出、viewer 不发送出站写入、强制控件按角色启用并上报审计、`server` 项目后端与“服务端项目”入口、访问管理页的角色选择。
- 发布兼容：访问库格式升为 2，直接回滚被兼容性检查拦截。

## Non-goals

- 组织/多租户、云端（非 Appliance）项目后端、单点登录（OD-001 剩余范围）。
- 网关侧区分“强制”与“写入”（协议无此语义；强制在 HMI 侧门控）。
- Forgejo 中项目的分支/合并工作流；跨用户实时协同编辑。

## Required Documents and Decisions

[ADR-0024](../../adr/ADR-0024-hmi-roles-and-server-projects.md)、[CONTRACT-ACCESS-002](../../contracts/HMI_ACCESS.md)、[CONTRACT-ACCESS-001](../../contracts/PROTECTED_PRESENTATIONS.md)、[CONTRACT-GATEWAY-001](../../contracts/GATEWAY.md)、OD-001（本步落实 Appliance 范围）、ADR-0012/0023、宪法 IO-2/IO-3、AI_SAFETY §4。

## Current Repository Facts

- 起点：`develop` = `e422bc6`（第 2 步 PR #22 已合并）；分支 `claude/remed-step3-access`。
- 访问服务已有 scrypt、`__Host-rv-access` 会话、CSRF、限速、审计；角色仅 `admin|visitor`。
- 浏览器的强制入口只有 `rv-signal-badge.tsx` 的 `useSignalForce`；出站写入集中在 `BaseIndustrialInterface.onFixedUpdatePost`。

## State Ownership and Compatibility

| 状态 | 位置 |
| --- | --- |
| 账户、会话、审计 | `data/access/access.sqlite`（v2） |
| Forgejo 项目服务令牌 | `data/access/forgejo-token`（0600） |
| 服务端项目内容 | Forgejo 仓库（所有者 `appliance`） |
| 网关写入审计 | `data/gateway/audit/writes.jsonl`（含 user/role） |

无 `services.access` 的部署行为不变。

## Allowed Paths

`appliance/**`、`gateway/**`、`scripts/build-offline-appliance.mjs`、`scripts/test-protected-presentations.mjs`、`src/core/hmi/**`、`src/core/project/**`、`src/core/deployment/deployment-config.ts`、`src/core/i18n/catalogs/**`、`src/interfaces/base-industrial-interface.ts`、`src/access/**`、`src/hooks/use-hmi-session.ts`、`src/main.ts`（一行初始化）、相关 `tests/**`、`docs/**`。

## Forbidden Paths

浏览器 Realtime v2 协议、项目文档与 GLB 格式、演示分享语义。

## Milestones

1. 服务端：角色/迁移/authz/审计事件/项目 API，正反例测试。
2. 入口与安装器：Caddy 会话门控、身份头剥离、管理员引导、服务令牌、兼容性格式。
3. 网关：受信身份与角色拒绝。
4. 浏览器：会话、门控、账户 UI、`server` 后端与入口。

## Progress

- [x] M1–M4 实现与测试（见 Validation）。
- [ ] 远程 CI（含真实 Caddy 的受保护演示旅程，其中新增 HMI 会话门控与伪造身份头断言）与合并。

## Surprises & Discoveries

- 强制在 v2 协议中只是一次普通写入，网关无法区分；因此“engineer 才能强制”只能在 HMI 侧门控，服务端证据是带用户的写入审计，另有浏览器上报的 `signal.force` 事件作补充。
- `shell.access` 的英文文案受逐字迁移校验约束，新文案放在独立的 `shell.account` 模块。
- Forgejo 的 blob SHA 是 SHA-1，而项目后端契约的修订号必须是内容 SHA-256；后端分别保存两者。
- 访问库 v2 会让旧版本控制面拒绝启动，已把 `protectedPresentations` 数据格式升为 2，使兼容性检查阻止直接回滚。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-01 | 四级角色；服务端扩展 Appliance 访问服务；项目存 Forgejo，每次保存一次提交 | 用户在缺口整改第 3 步的明确选择 |
| 2026-11-01 | 入口以 `forward_auth` 强制会话，IT 面保留 Basic Auth | ADR-0024 |
| 2026-11-01 | 无 admin 时用 operator 凭据引导 HMI 管理员 | 防止升级后无人可登录 |

## Validation

本地（macOS arm64，2026-11-01，提交前）：

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（离线帮助按安装手册变化重新生成） |
| `./scripts/verify.sh static` | 通过；新增 6 处内部契约错误在 `error-triage.json` 登记，`server-backend.ts` 的同源 fetch 在 `network-boundary-review.json` 审计 |
| Node（Vitest） | 88 文件 / 901 条通过（`appliance-lifecycle` 以临时占位 Linux 命令运行）。新增：`hmi-access`（7：角色顺序、v1→v2 迁移、authz 正反例与重定向、停用即失效、角色化建号、强制事件审计、登录跳转净化）、`server-projects`（4：提交作者、过期基线 409、角色/会话/CSRF/Origin/路径、删除与令牌缺失 503）、Appliance 安装（HMI 管理员引导、Forgejo 令牌 0600、Caddy 会话门控与身份头剥离）、访问库格式 2 阻止直接回滚 |
| 网关 `npm test` | 21 条通过（新增受信身份：无身份 401、未知角色 401、viewer 写入 `forbidden-role`、operator 写入成功、审计含 user/role） |
| `./scripts/verify.sh build` | 通过 |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过；新增 `hmi-session`（5）、`server-backend`（4） |

未验证（需远程 CI 或实机）：真实 Caddy 上的 `forward_auth`（由 CI 的受保护演示旅程覆盖，本机无 Docker）；真实 Forgejo 的 contents API 与 CLI 令牌签发；Appliance 实机上的登录、角色与项目保存；多用户并发编辑同一服务端项目的人工体验。

## Rollback

去掉 Caddy `forward_auth` 路由与网关 `trustProxyIdentity` 即回到 Basic Auth 行为；访问库 v2 只增不减，降级须用一致性备份恢复。浏览器改动在无 `services.access` 的部署中无效果。

## Outcomes & Retrospective

（远程 CI 与合并后补齐。）
