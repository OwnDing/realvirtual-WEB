---
doc_id: ADR-0028
title: 多人会话角色由登录会话决定，并由网关守卫强制
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-03
authority: normative
---

# ADR-0028：多人会话角色由登录会话决定，并由网关守卫强制

## Context

多人协作（`src/plugins/multiuser-plugin.ts`）连接 Unity 内置的 MultiplayerWEB 服务（7000 端口，不在本仓）或中继服务。角色 `operator` / `observer` 由浏览器自报：URL `?role=`、设置页或多人面板选择后写进 `room_join`。协议文档（`doc-multiuser-system.md`）写明“权限由 Unity 服务端强制、中继按原样转发”，但 Unity 只能相信浏览器报上来的角色。

后果：任何人在 URL 加 `?role=operator` 即可发送 `signal_write`、`drive_jog`、`drive_stop`。这些消息进入 Unity 仿真，Unity 侧可能接着真实 PLC，因此这是一条绕过网关角色检查（[ADR-0024](ADR-0024-hmi-roles-and-server-projects.md)）且没有审计的写路径。

此外，Appliance 通过 HTTPS 提供界面，浏览器默认的 `ws://<host>:7000` 会被混合内容策略拦截，多人协作在 Appliance 中实际上无法使用。

用户在 2026-11-03 第二轮整改第 4 步选择“浏览器上限 + 网关守卫”（批准来源：用户当前明确指令）。

## Decision

1. **角色映射**：HMI 角色 `viewer` 对应多人角色 `observer`；`operator`、`engineer`、`admin` 最高可为 `operator`。只有能写信号（`hmiCan('write-signals')`）的会话才能成为 `operator`。
2. **浏览器上限（体验层）**：部署配置了访问服务时，请求的角色只能被会话降低、不能被抬高。已登录：按上一条取上限；未登录、加载中或出错：一律 `observer`。未配置访问服务（公共版、独立部署）时保持原有自报行为，并在文档中明确这不是安全边界。会话变化导致有效角色变化时，已连接的会话以新角色重新加入。`observer` 时浏览器不发送写类消息。
3. **网关守卫（安全边界）**：XYvirtual Gateway 新增可选的 `multiuser` 配置。启用后在 `multiuser.path`（Appliance 中为 `/gateway/multiuser`）提供 WebSocket 代理，转发到 `multiuser.upstream`（Unity 或中继）。
   - 启用前提是 `trustProxyIdentity: true`；没有入口代理注入的 `X-Rv-User` / `X-Rv-Role` 就拒绝连接（401）。
   - `room_join` 的 `role` 一律由网关按第 1 条覆盖，浏览器发来的值被忽略。
   - `signal_write`、`drive_jog`、`drive_stop`、`shared_view_on` 仅限可写会话。不可写会话的这些消息被丢弃，并以协议的 `error` 消息（`permission_denied`）回复。
   - 浏览器发往上游的消息只接受已知类型的 JSON 对象（`room_join`、`room_leave`、`avatar_update`、`cursor_ray`、`look_at`、`shared_view_on/off`、`signal_write`、`drive_jog`、`drive_stop`、`annotation_add/update/remove/sync`）。其他类型、非 JSON 或超长消息被丢弃，使未知消息无法成为提权通道。上游发往浏览器的消息原样转发。
   - 每条写类消息（允许或拒绝）都写入网关审计日志，带用户名与角色。被转发的写记为 `unknown`：网关无法得知 Unity 是否执行。
4. **部署契约**：部署配置新增 `services.multiuser`（仅同源路径）。Appliance 默认 `/gateway/multiuser`；浏览器据此推导默认服务器地址（`wss://<host>/gateway/multiuser`）。插件从不自动连接默认地址，所以未配置上游时不会产生连接噪音。
5. **网络前提**：守卫只在 Unity 的 7000 端口只对 Appliance 开放时才是边界。部署文档要求现场把该端口限制为仅 Appliance 可达，且 Appliance 部署的外呼策略不放行直连 Unity。
6. **批注**：`annotation_*` 对所有角色开放。批注只改协作视图，不写机器。

## Alternatives

- **只做浏览器上限**：改过的浏览器仍可自报 `operator`，只能算体验层。未采用（用户选择两者）。
- **在 Unity 服务端校验会话**：Unity 服务不在本仓，也拿不到 Appliance 会话。不可行。
- **让中继服务校验**：中继在独立仓库，且公共中继不认识 Appliance 账户。不可行。
- **守卫透传未知消息类型**：兼容性更好，但未知消息可能成为提权通道。未采用；协议新增类型时同步扩充白名单。

## Consequences

- Appliance 中的多人写操作首次有了身份、角色检查与审计；`viewer` 账户无法再通过多人通道写入。
- Appliance 中的多人协作改为经同源 `wss` 连接，能在 HTTPS 下工作。
- 代价：网关多一个长连接代理，每个浏览器连接对应一个上游连接，并受 `multiuser.maxClients` 限制。协议新增消息类型时需要同步网关白名单。
- 非 Appliance 部署（无访问服务）的行为不变，仍然是自报角色，文档如实写明。

## Compatibility and Migration

- 浏览器：没有访问服务时行为不变；`?role=` 等参数保留，但在有会话的部署中只能降低角色。
- 网关：`multiuser` 是可选新键，原有配置与 schemaVersion 1 不变。
- 部署配置：`services.multiuser` 是可选新键，旧配置照常通过校验。
- Appliance：新安装的部署配置带默认路径；上游地址由管理员在 `gateway.json` 中配置。未配置时该路由返回拒绝，其他功能不受影响。

## Validation

- 网关单元/集成测试：无身份时拒绝；`room_join` 角色被覆盖；`viewer` 会话的写类消息被丢弃、回复 `permission_denied`、写入审计；`operator` 的写类消息被转发并审计；未知类型与非 JSON 被丢弃；上游消息原样到达；配置缺少 `trustProxyIdentity` 时启动失败。
- 浏览器测试：角色上限函数的矩阵；`observer` 时插件不发写类消息；会话变化后以新角色重新加入；默认地址取自 `services.multiuser`。
- 部署配置测试：`services.multiuser` 只接受同源路径。

## Rollback or Supersession

删除 `gateway.json` 中的 `multiuser` 键即关闭守卫；浏览器上限可按提交回退，回退后恢复为自报角色（会重新打开第 1 节所述写路径，不推荐）。若将来 Unity 服务或中继能直接校验 Appliance 会话，由新 ADR 替代第 3 条。
