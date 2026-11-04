---
doc_id: EP-MULTI-001
title: 第二轮整改第 4 步：多人会话角色接入登录会话并由网关守卫强制
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-11-04
authority: normative-process
---

# EP-MULTI-001：第二轮整改第 4 步：多人会话角色接入登录会话并由网关守卫强制

## Purpose

完成后，在有个人账户的部署（Offline Appliance）中，多人协作的 `operator` / `observer` 角色由登录会话决定，不再由 URL 或界面自报。`viewer` 账户无法通过多人通道写信号或点动驱动，每条多人写操作都有用户身份的审计记录；Appliance 的多人协作经同源 `wss` 工作。

## Scope

- 浏览器：角色规则 `src/core/hmi/multiuser-role.ts`；`MultiuserPlugin` 以会话为上限并在会话变化时重新加入，`observer` 不发写类消息，默认服务器地址取 `services.multiuser`；设置页的角色选择显示上限。
- 网关：可选 `multiuser` 配置与 `MultiuserGuard`（认证、角色覆盖、写类消息拦截、消息类型白名单、审计），`/health` 报告守卫状态。
- 部署契约：`services.multiuser`（仅同源路径）；Appliance 构建默认 `/gateway/multiuser`。
- 文档：ADR-0028、`doc-multiuser-system.md`、`gateway/README.md`。

## Non-goals

- 不改 Unity MultiplayerWEB 服务或中继服务（不在本仓）。
- 不改多人协议的消息格式；不新增多人角色等级。
- 不在 Appliance 安装流程中自动配置上游地址（Unity 主机由现场管理员写入 `gateway.json`），也不自动配置现场防火墙。
- 不改无访问服务部署的自报行为（文档如实说明不是安全边界）。

## Required Documents and Decisions

[ADR-0028](../../adr/ADR-0028-multiuser-role-from-session.md)（本计划的决定）；[ADR-0024](../../adr/ADR-0024-hmi-roles-and-server-projects.md)（四级角色、forward_auth、网关按角色写入）；ADR-0006（外呼策略）；ADR-0023（自有网关）；用户 2026-11-03 指令“按你建议的顺序……做到第 5 步”与本步选择“浏览器上限 + 网关守卫”。

## Current Repository Facts

- 起点：`develop` = `f9b35b6`（第 1 步已合入；第 2、3 步在各自分支待推送）。
- `multiuser-plugin.ts` 从 `?role=` / `?multiuserRole=`、设置页或多人面板取角色，原样写入 `room_join`；`writeSignal` / `jogDrive` / `stopDrive` 不检查角色。
- `doc-multiuser-system.md` 写明“权限由 Unity 服务端强制、中继按原样转发”。Unity 只能相信浏览器报上来的角色。
- Appliance 以 HTTPS 提供界面；插件默认 `ws://<host>:7000`，会被混合内容策略拦截。
- 网关已有 `proxyIdentity()`（ADR-0024）、`ws` 依赖与审计日志；Caddy 已把 `/gateway/*` 置于 HMI 会话的 forward_auth 之后。

## State Ownership and Compatibility

- 浏览器不新增持久化状态；设置中保存的角色仍是“请求”，有效角色每次由会话计算。
- 网关 `multiuser` 为可选新键，未配置时行为与原来一致；审计沿用 `audit.path`，新增 `signal` 形如 `multiuser:<type>:<path>` 的记录。
- 部署配置 `services.multiuser` 为可选新键；旧配置照常通过校验。

## Allowed Paths

- `src/plugins/multiuser-plugin.ts`、`src/core/hmi/multiuser-role.ts`（新增）、`src/core/hmi/settings/MultiuserTab.tsx`
- `src/core/deployment/deployment-config.ts`（`services.multiuser`）
- `src/core/i18n/catalogs/en-US.deferred.ts`、`zh-CN.ts`（`settings.multiuser.roleCapped`）、`scripts/i18n-verbatim-check.mjs`（豁免一条）
- `gateway/src/config.mjs`、`gateway/src/gateway.mjs`、`gateway/src/multiuser-guard.mjs`（新增）、`gateway/test/**`、`gateway/README.md`
- `scripts/build-offline-appliance.mjs`（`services.multiuser` 默认值）
- `tests/**`、`docs/**`、`doc-multiuser-system.md`

## Forbidden Paths

`appliance/config/Caddyfile.template`（`/gateway/*` 已在 forward_auth 之后，无需改动）、`appliance/runtime/access/**`、`gateway/src/realtime-server.mjs` 与 `write-policy.mjs`（信号写策略不变）、`src/core/hmi/hmi-session-store.ts`（角色与能力矩阵不变）、`src/core/hmi/ActivityBar.tsx` 及其他被教程视频源摘要钉住的文件、`schema/`。

## Milestones

1. **M1 规则与浏览器上限**：角色矩阵测试；插件 `room_join` 角色、`observer` 不发写、会话变化重新加入、默认地址。
2. **M2 网关守卫**：真实 socket 的集成测试（无身份 401、角色覆盖、`viewer` 写被拒并审计、`operator` 写被转发并审计为 `unknown`、未知类型与非 JSON 被丢弃、配置失败关闭）。
3. **M3 部署契约与文档**：`services.multiuser` 校验与 Appliance 默认值；ADR、协议文档、网关 README。
4. **M4 门禁与远程 CI**。

## Progress

- [x] M1（2026-11-03）
- [x] M2（2026-11-03）
- [x] M3（2026-11-03）
- [x] M4 本地门禁与远程 CI（PR #30）

## Surprises & Discoveries

- Appliance 中的多人协作此前实际上无法工作：HTTPS 页面不能打开 `ws://<host>:7000`。守卫的同源 `wss` 路由顺带解决了这一点。
- 协议文档的权限表只列写信号与点动；`toggleSharedView` 的注释另有“只有 operator 能开启共享视角”。守卫把 `shared_view_on` 一并列为 operator 专属，并补进文档的权限表。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-03 | 浏览器上限 + 网关守卫两层都做 | 用户当前明确指令（选择“Client cap + gateway guard”） |
| 2026-11-03 | 守卫只转发已知消息类型 | 未知类型可能成为提权通道；协议新增类型时同步白名单（ADR-0028 Alternatives） |
| 2026-11-03 | 批注对所有角色开放 | 批注只改协作视图，不写机器（ADR-0028 第 6 条） |
| 2026-11-03 | 被转发的多人写在审计中记为 `unknown` | 网关看不到 Unity 是否执行，沿用审计语义中“可能已到达、不重试”的含义 |

## Validation

本地（2026-11-03，Darwin / Apple Silicon，Node 22）：

- 网关：`gateway/test/multiuser.test.mjs` 8/8（真实 socket：无身份 401；`viewer` 的 `room_join` 自报 `operator` 被改为 `observer`、`operator` 自报 `observer` 被改为 `operator`；`viewer` 的 `signal_write` / `drive_jog` / `shared_view_on` 被丢弃并回复 `permission_denied`，两条写被审计为 `rejected`、带用户与角色；`engineer` 的 `signal_write` 原样转发并审计为 `unknown`；非 JSON、数组与未知类型 `role_change` 不到达上游；`/health` 报告守卫；配置缺 `trustProxyIdentity`、非 ws 上游、路径冲突、未知键均失败关闭）。网关全套 29/29。
- 浏览器：`tests/multiuser-role.test.ts` 7/7（规则矩阵；`viewer` 请求 `operator` 以 `observer` 加入且只发出 `room_join` 与 `cursor_ray`；`operator` 会话可写；加载中自动加入后会话就绪即以 `operator` 重新加入、登出后降为 `observer`；`services.multiuser` 决定默认地址，否则保持 7000 端口默认）。既有多人测试（`rv-multiuser`、`remote-matrix`、`rv-shared-view`）一并通过，合计 47 例。
- 部署配置：`services.multiuser` 只接受同源路径（4 种非法值被拒）；Appliance 构建默认值由 `tests/appliance-bundle.node.test.ts` 断言。
- `./scripts/verify.sh governance`（192 份）、`static`、`node`（96 文件 / 948 例，另含网关 29 例）、`build` 退出 0；`node scripts/i18n-verbatim-check.mjs` 通过（`settings.multiuser.roleCapped` 按豁免登记）。
- `CI=1 ./scripts/verify.sh browser`：八个主 shard 与性能套件全部通过，1,063 文件 / 11,132 例通过、3 文件跳过、零失败。
- 入口 chunk 3,520,976 字符（ADR-0027 预算 3,600,000；本分支基于 `develop` 3,519,856，+1,120）。

未验证（如实记录）：真实 Unity MultiplayerWEB 服务与中继；Appliance 中 Caddy → 网关 → Unity 的完整链路与现场防火墙；真实 PLC 经 Unity 的写入。纳入第 5 步实机验收清单。

远程 CI：PR #30 首轮（`ba5b9af`）run [`41638510855`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41638510855) 七项通过；合入第 3 步后更新的 `5aa83c3` 在 run [`41662550666`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41662550666) 七项通过（E2E Gate 按设计跳过）；2026-11-03T15:52:17Z 合入 `develop`，merge commit `1b15163`；合并后 `develop` run [`41668335474`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41668335474) 通过。

## Rollback

删除 `gateway.json` 的 `multiuser` 键即关闭守卫；浏览器上限与 `services.multiuser` 按提交回退。回退浏览器上限会恢复自报角色，不推荐。

## Outcomes & Retrospective

在有账户的部署中，多人角色由会话决定：浏览器以会话为上限，Appliance 网关守卫覆盖 `room_join` 角色、拦截 viewer 的写类消息并审计。Appliance 的多人协作也因此能在 HTTPS 下工作。遗留：真实 Unity / 中继、Caddy → 网关 → Unity 全链路与现场防火墙，归入 EP-APPLIANCE-001 现场验收 F12；无访问服务的部署仍为自报角色（文档写明不是边界）。
