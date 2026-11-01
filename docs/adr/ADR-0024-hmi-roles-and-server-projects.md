---
doc_id: ADR-0024
title: HMI 四级角色、写操作审计与 Forgejo 服务端项目存储
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# ADR-0024：HMI 四级角色、写操作审计与 Forgejo 服务端项目存储

## Context

OD-001 于 2026-08-23 定为“平台包含账户、组织、权限与云端资产”，但规格一直未落地（`decided-pending-spec`）。现状：

- HMI 本身没有登录。Appliance 入口用一个共享的 operator Basic Auth 账户保护整个工作台，任何拿到它的人都能写 PLC、强制信号、改项目，而且审计里没有“是谁”。
- Appliance 访问服务（`appliance/runtime/access/`）已有 scrypt 口令、`__Host-` 会话 Cookie、CSRF、登录限速和审计表，但角色只有 `admin`（演示管理）与 `visitor`（演示分享）。
- 项目只存在各自浏览器（localStorage/OPFS）或本机文件夹；Appliance 内置的 Forgejo 没有任何 Web 端读写。

2026-11-01 用户在缺口整改第 3 步选择“四级角色：viewer 只看；operator 写信号、点动；engineer 强制信号、编辑并保存项目；admin 管理用户。所有写操作和强制操作都记审计日志”，并接受“服务端扩展 Appliance 现有的访问服务，项目存储落到 Appliance 内置的 Forgejo，每次保存即一次 Git 提交”。

## Decision

1. **身份源**：Appliance 访问服务是 HMI 的唯一身份源。账户角色扩展为 `viewer < operator < engineer < admin`，保留独立的 `visitor`（仅演示分享，不进入 HMI）。数据库 `user_version` 1 → 2 迁移，旧账户角色不变。
2. **权限矩阵**：

   | 能力 | viewer | operator | engineer | admin |
   | --- | --- | --- | --- | --- |
   | 打开 HMI、读信号与历史、打开服务端项目 | ✓ | ✓ | ✓ | ✓ |
   | 写 PLC 信号（经网关，仍受网关写入策略约束） |  | ✓ | ✓ | ✓ |
   | 强制信号 |  |  | ✓ | ✓ |
   | 保存/新建服务端项目 |  |  | ✓ | ✓ |
   | 用户管理、读审计 |  |  |  | ✓ |

3. **强制点**：
   - Caddy 用 `forward_auth` 把 HMI 入口（WEB、`/gateway/*`、`/api/projects/v1/*`）交给访问服务的 `GET /api/access/v1/authz` 判定；未登录的文档请求跳到 `/login/`。`/appliance/*`、`/diagnostics/*`、`/git/*` 与 Influx 主机仍用 IT 的 operator Basic Auth；`/present/` 与 `/api/access/v1` 保持原样。
   - 网关仅在 `trustProxyIdentity: true` 时信任入口注入的 `X-Rv-User`/`X-Rv-Role`；没有身份的连接被拒绝；viewer 的写请求以 `forbidden-role` 拒绝并审计。写入仍受 ADR-0023 的信号级策略约束。
   - 项目 API：viewer 起可读；engineer 起可写，写操作必须带会话 CSRF。
   - 浏览器按角色禁用对应控件；这只是体验层，服务端判定才是边界。
4. **审计**：网关写入审计（JSON Lines）记录 `user`/`role`；访问服务审计表新增 `detail`，记录登录、用户变更、项目保存（提交 SHA）以及浏览器上报的强制设置/解除。强制是 HMI 概念（保持一个值），在网关侧表现为普通写入，因此它的服务端证据是带用户的写入审计；浏览器上报的强制事件是补充记录，不作为权限边界。
5. **服务端项目存储**：控制面以服务令牌（安装时由 Forgejo CLI 签发，仓库作用域，0600 文件）调用 Forgejo API。每个项目一个仓库（所有者为 Appliance 内置管理员 `appliance`），每次保存 = 一次提交，提交作者为登录用户；乐观并发以文件 SHA 为修订号，冲突返回 409。浏览器新增 `server` 项目后端，与 `browser`/`folder`/`bundled` 并列。
6. **升级不锁死**：升级时若访问服务没有任何 admin 账户，安装器以现有 operator 凭据创建同名 admin 账户，并在安装输出中提示首次登录后修改。

## Alternatives

- 继续共享 Basic Auth：无法区分人与角色，审计无法回答“谁写了 PLC”。用户未采用。
- 只在浏览器做角色判断：被篡改的浏览器即可绕过，违反 IO-2。未采用。
- 网关自带账户库：形成第二个身份源，口令策略和停用无法统一。未采用。
- 项目直接存 Forgejo 由浏览器调用 Forgejo API：需要把 Forgejo 令牌交给浏览器。未采用。

## Consequences

- HMI 首次需要登录；共享 operator 账户从 HMI 退出，只用于 IT 运维面。
- 每个 HMI 静态请求都会经过一次本机 `forward_auth`，局域网规模下可接受；需要在性能验收中观察。
- 服务端项目只在 Appliance 部署中可用；纯浏览器部署不受影响。

## Compatibility and Migration

浏览器后端、项目格式、GLB 不变；`server` 后端只是新增的数据源。访问数据库自动迁移到 v2；旧发布的安装器不认识 v2 时会拒绝启动（`Unsupported access database version`），因此回滚到旧版本前须按升级手册用一致性备份恢复。

## Validation

访问服务：迁移、角色校验、`authz` 正反例、CSRF、限速、审计；网关：受信头身份、viewer 写拒绝、审计含用户；项目 API：Forgejo 模拟服务器上的列出/读取/保存/冲突/权限；浏览器：后端单元测试与按角色的 UI 门控；Appliance：Caddy 渲染、服务令牌签发、无 admin 时的引导账户。真实 Forgejo 与现场账户策略需在 Appliance 实机验收。

## Rollback or Supersession

去掉 Caddy `forward_auth` 路由即恢复 Basic Auth 行为；访问数据库 v2 只增不减，降级需走备份恢复。组织/多租户与云端（非 Appliance）项目后端仍属 OD-001 的剩余范围，另立规格。
