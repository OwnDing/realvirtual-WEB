---
doc_id: EP-GATEWAY-001
title: 缺口整改第 2 步：自有工业网关（OPC UA），CONNECT 可选
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-01
authority: normative-process
---

# EP-GATEWAY-001：缺口整改第 2 步：自有工业网关（OPC UA），CONNECT 可选

## Purpose

完成后，不依赖上游 CONNECT 也能把 OPC UA 控制器的信号实时接入 XYvirtual WEB、按显式策略写回并留审计、在 HMI 趋势面板查看 InfluxDB 历史；Appliance 默认包含该网关，CONNECT 成为可选组件。

## Scope

- `gateway/`：独立 npm 包（node-opcua-client、node-opcua-certificate-manager、ws），OPC UA 源、WebSocket Realtime v2 服务端、写入策略与审计、InfluxDB 历史、`/health`、空闲（未配置）模式、CLI。
- 浏览器：Historian 可用性不再绑定 CONNECT 连接（`services.historian` 部署配置）；WebSocket Realtime 接口支持“同源”地址（`wsAddress` 为空）。
- Appliance：打包器包含经过校验的网关生产安装、CONNECT 改可选；运行时生成网关服务（Linux systemd / Windows WinSW / 容器）、Caddy `/gateway/*` 路由、健康检查、默认只读配置；Web 预设指向 `/gateway/ws` 与 `/gateway/history`。
- Harness/CI：Node 门禁运行网关测试，Supply Chain Gate 增加 `gateway` 作用域。

## Non-goals

- S7、Modbus 等其他协议；AI Agents、CONNECT 自更新与插件目录的替代。
- 用户身份与角色（第 3 步；网关已预留 `identify` 钩子与审计 `user`/`role` 字段）。
- 真实 PLC、客户 PKI 证书与现场网络验收（IO-4，需另行授权）。

## Required Documents and Decisions

[ADR-0023](../../adr/ADR-0023-own-industrial-gateway.md)、[CONTRACT-GATEWAY-001](../../contracts/GATEWAY.md)、[OPEN_DECISIONS](../../governance/OPEN_DECISIONS.md) OD-011（closed）、ADR-0009/0019/0022、宪法 IO-1…IO-5、AI_SAFETY §4/§5。

## Current Repository Facts

- 起点：`develop` = `d9c2e14`（第 1 步已合并）；分支 `claude/remed-step2-gateway`。
- 浏览器协议的唯一实现在 `src/interfaces/signal-transport-core.ts`；Historian 只用 `/history/status|signals|query`。
- Appliance 原把 `connect` 作为必需组件、必需入口、必需健康检查和 Caddy 根路由。
- 本机 macOS 缺 `systemctl/useradd/runuser`，生命周期测试在本地需用临时占位命令运行；CI Ubuntu 原生运行。

## State Ownership and Compatibility

| 状态 | 位置 | 说明 |
| --- | --- | --- |
| 网关配置 | Appliance `config/gateway.json` | 首次安装生成（只读、无源），之后归管理员所有，升级不覆盖 |
| 写入审计 | `data/gateway/audit/writes.jsonl` | 追加写，0640 |
| InfluxDB 令牌副本 | `data/gateway/influx-token` | 0600，与 Appliance 秘密一致 |
| 历史数据 | InfluxDB bucket `signals` | measurement `signal`，与 CONNECT 数据不保证互通 |

现有 `appliance.json` 无 `gatewayPort` 时默认 5200；旧版本发布（仅含 `connect`）仍可通过包校验，保证回滚。

## Allowed Paths

`gateway/**`、`appliance/**`、`scripts/build-offline-appliance.mjs`、`scripts/security/**`、`scripts/verify.sh`、`security/**`、`.github/workflows/quality-gates.yml`、`src/core/hmi/historian-store.ts`、`src/plugins/historian-trend-plugin.tsx`、`src/core/deployment/deployment-config.ts`、`src/interfaces/websocket-realtime-interface.ts`、相关 `tests/**`、`docs/**`。

## Forbidden Paths

浏览器 Realtime v2 协议语义、`rv_extras`/项目格式、CONNECT 相关浏览器 UI 行为。

## Milestones

1. 网关黄金切片：真实 OPC UA 测试服务器 ↔ 网关 ↔ v2 客户端的握手、快照、增量、写入成功/拒绝、审计、断线 `unknown`、重连。
2. 历史：InfluxDB 写入与查询；浏览器 Historian 独立于 CONNECT。
3. 供应链：`gateway` 作用域扫描通过。
4. Appliance：无 CONNECT 打包、网关服务与路由、默认配置、回滚兼容。

## Progress

- [x] M1：20 条网关测试（单元、进程内 OPC UA 集成、CLI 冒烟）。
- [x] M2：Historian 解耦与 `services.historian`；同源 WebSocket 端点。
- [x] M3：`ws` 8.18.3 的两个 High 漏洞被门禁拦截后升级至 8.22.1；3 条网关逐包许可判定、2 份补充正文；`gateway` 作用域退出 0。
- [x] M4：打包器/运行时/控制面/容器编排改造及测试。
- [ ] 远程 CI 与合并。

## Surprises & Discoveries

- 首次固定的 `ws@8.18.3` 有两个 High 公告，新的 `gateway` 作用域扫描立即拦截——门禁起了预期作用。
- `dequeue`、`precond` 的 `package.json` 未声明许可，ADR-0022 扩展了 `declared: null` 的精确判定。
- Appliance 控制面原把 `connectHealth` 作为必填 URL；不扩展会导致无 CONNECT 的 Appliance 控制面无法启动。
- `control` 镜像有 `ENTRYPOINT`，容器内运行网关必须显式覆盖 `entrypoint`。
- Appliance 入口除健康与演示外均有操作员 Basic Auth，`/gateway/*` 因而不对未认证局域网开放；精细角色在第 3 步。
- PR #22 首轮远程 Browser Gate（run `41269779013`）失败：`scripts/test-protected-presentations.mjs` 自行渲染 Caddy 模板，缺新变量 `CONNECT_ROUTES`/`GATEWAY_UPSTREAM`。根因是模板渲染存在两份实现；改为共享的 `renderCaddyfile()`（`appliance/runtime/lib/config.mjs`），旅程脚本以含 CONNECT 的变体渲染，并新增 Node 守卫测试校验脚本覆盖全部模板变量。本机无 Docker 守护进程，该真实 HTTPS 旅程只能由远程 CI 验证。
- 复查发现 `installOrUpgrade` 的 Windows 容器分支仍无条件安装 CONNECT 服务（`startInstalledRuntime` 已正确判断）；已改为仅在发布包含 CONNECT 时安装。该路径没有 Windows 打包夹具，修复仅经代码审查，未自动化验证。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-01 | 自研网关、CONNECT 可选 | 用户明确选择（OD-011 / ADR-0023） |
| 2026-11-01 | 网关为独立 npm 包并独立扫描，而非并入根依赖 | ADR-0023 Alternatives |
| 2026-11-01 | Appliance 网关默认只读、无源；首次安装后配置归管理员 | IO-2、IO-4：默认不连接、不写真实设备 |
| 2026-11-01 | 容器模式复用已锁定的 control 镜像运行网关 | 不新增未锁定的 OCI 基础镜像 |

## Validation

本地（macOS arm64，2026-11-01，提交前）：

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（离线帮助因安装手册与安全运维输入变化重新生成） |
| `./scripts/verify.sh static` | 通过 |
| 网关 `npm test` | 20 条通过：单元 10、进程内 OPC UA 集成 8（握手、快照、增量、写入成功/拒绝、审计、历史写入与查询、断线 `unknown` 与重连）、CLI 冒烟 2 |
| Node（Vitest） | 86 文件 / 888 条通过（`appliance-lifecycle` 在本机以临时占位的 `systemctl/useradd/runuser` 运行；不加占位时这 7 条仍因 macOS 缺命令失败，与改动无关） |
| `./scripts/verify.sh build` | 通过 |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过，无失败 |
| `./scripts/verify.sh supply-chain`（Node 22.22.2 / npm 10.9.7） | `web` 与 `gateway` 两个作用域均退出 0 |

未验证：真实 PLC / OPC UA 服务器 / 客户 PKI；真实 Appliance 安装（Linux 与 Windows、原生与容器）中的网关服务启动；CONNECT 与网关并存的现场部署。远程 CI 单独记录。

## Rollback

浏览器改动向后兼容（未配置 `services.historian` 时行为不变；非空 `wsAddress` 行为不变）。Appliance 可回滚到旧版本（包校验接受仅含 `connect` 的旧发布）。删除 `gateway/` 与相关 Appliance 改动即恢复原拓扑。

## Outcomes & Retrospective

（远程 CI 与合并后补齐。）
