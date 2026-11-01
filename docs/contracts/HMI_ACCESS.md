---
doc_id: CONTRACT-ACCESS-002
title: HMI 账户、角色授权与服务端项目接口契约
status: approved
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# HMI 账户、角色授权与服务端项目接口契约

依据 [ADR-0024](../adr/ADR-0024-hmi-roles-and-server-projects.md)。实现位于 `appliance/runtime/access/`、`appliance/config/Caddyfile.template`、`gateway/` 与浏览器 `src/core/hmi/hmi-session-store.ts`、`src/core/project/backends/server-backend.ts`。演示访问（[CONTRACT-ACCESS-001](PROTECTED_PRESENTATIONS.md)）的会话、Cookie 与 CSRF 规则不变并被复用。

## 1. 角色

`viewer < operator < engineer < admin`；`visitor` 只用于演示分享，不是 HMI 角色。账户只能由 admin（访问管理页或 `/users` 接口）或本机 `runtime/access/admin.mjs` 创建，口令策略同 CONTRACT-ACCESS-001。数据库 `user_version` 2；v1 自动迁移，账户角色不变。

| 能力 | 最低角色 | 强制点 |
| --- | --- | --- |
| 进入 HMI（WEB、`/gateway/*`、`/api/projects/v1/*`） | viewer | Caddy `forward_auth` → `GET /api/access/v1/authz?need=viewer` |
| 写 PLC 信号 | operator | 网关 `trustProxyIdentity`；浏览器 viewer 不发送出站写入 |
| 强制信号 | engineer | 浏览器强制控件；到达 PLC 的写入由网关按 operator 规则审计 |
| 保存/新建/删除服务端项目 | engineer | 项目 API |
| 用户管理、读审计 | admin | 访问 API |

## 2. 授权判定 `GET /api/access/v1/authz?need=<role>`

- 有效会话且角色 ≥ `need`：`204`，响应头 `X-Rv-User`（规范化用户名）、`X-Rv-Role`。
- 有会话但角色不足：`403`。`need` 不是 HMI 角色：`400`。
- 无会话 / 会话失效 / 演示访客会话：若请求 `Accept` 含 `text/html`，`302` 到 `/login/?next=<X-Forwarded-Uri>`（仅同源路径，否则为 `/`）；否则 `401`。未认证的判定不写审计表。
- 入口在 `route` 开头删除客户端自带的 `X-Rv-User`/`X-Rv-Role`，只有 `forward_auth` 的 `copy_headers` 能设置它们。

## 3. 浏览器上报事件 `POST /api/access/v1/audit-events`

需要会话、同源 `Origin` 与 `X-CSRF-Token`。正文 `{ action, target, detail? }`；`action` ∈ `signal.force`、`signal.unforce`（均需 engineer），`target` 1–256 字符。写入审计行 `outcome = reported`，`detail` 为 JSON，用户名与角色取自会话而非正文。返回 `201`。该记录是补充证据，不构成权限边界。

## 4. 服务端项目 `/api/projects/v1`

所有请求需会话（viewer 起）；写请求另需同源 `Origin`、`X-CSRF-Token` 与 engineer 起角色。路径中出现 `%` 或 `\` 一律 `400`；项目 ID `^[a-z0-9][a-z0-9-]{0,63}$`；文件路径最多 8 段，每段 `^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,127}$`（不得以 `.` 开头）。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /projects` | `[{ id, name, updatedAt }]` |
| `POST /projects` `{ id, name }` | 新建私有仓库（初始提交、默认分支 `main`）；已存在 `409 PROJECT_EXISTS` |
| `GET /projects/:id/tree` | `[{ path, size, revision }]` |
| `GET /projects/:id/files/<path>` | 原始字节，`X-Rv-Revision` = 服务端修订号 |
| `PUT /projects/:id/files/<path>` | 原始字节，≤ 64 MiB；`X-Rv-Base-Revision` 为基线（新建时省略）；成功 `201`/`200 { revision, commit }`；基线过期 `409 REVISION_CONFLICT` |
| `DELETE /projects/:id/files/<path>` | 必须带 `X-Rv-Base-Revision`，否则 `428 REVISION_REQUIRED` |

每次 `PUT`/`DELETE` 是一次 Forgejo 提交，作者与提交者为登录用户（`<username>@users.xyvirtual.invalid`），并写访问审计 `project.save`/`project.delete`（detail 含提交 SHA）。Forgejo 令牌只在控制面进程内（`data/access/forgejo-token`，0600）；令牌缺失时 `503 PROJECTS_UNAVAILABLE`。

## 5. 浏览器部署配置

`services.access.url` 与 `services.projects.url` 只接受同源路径（会话 Cookie 为 `SameSite=Strict`）。未配置 `services.access` 的部署没有个人账户，所有能力保持原有行为。`server` 项目后端以内容 SHA-256 作为对外修订号，内部以服务端修订号作为提交基线；服务端 409 表现为 `SceneRevisionConflictError`。

## 6. 兼容性

旧版本访问服务不识别 v2 数据库（拒绝启动），因此跨此版本回滚须按升级手册使用一致性备份。浏览器协议、项目文档格式与 GLB 不变。
