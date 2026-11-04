---
doc_id: ADR-0029
title: 容器模式工业网关经专用 ot 网络到达 PLC，出口由客户宿主 ACL 约束
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-04
authority: normative
---

# ADR-0029：容器模式工业网关经专用 ot 网络到达 PLC，出口由客户宿主 ACL 约束

## Context

ADR-0023 把自有工业网关（OPC UA → WebSocket Realtime v2）放进 Appliance。容器模式的 Compose 拓扑早于网关：`backend` 网络为 `internal: true`，只有 Edge 另接非 internal 的 `frontend` 以发布 80/443（见 [架构](../architecture/OFFLINE_APPLIANCE.md)）。网关被加入时只接了 `backend`。

EP-APPLIANCE-001 本机演练（2026-11-04，Debian 12 主机、Docker Engine 29.9.3）实测：网关容器内只有 backend 子网路由，向演练“工厂网络”上的 OPC UA 模拟器 `172.30.0.20:4840` 建立 TCP 连接得到 `ENETUNREACH`，宿主本身可达；同一模拟器在原生模式下 `source connected`。因此容器模式的网关无法连接容器网络之外的任何 PLC，现场验收 F7–F10 在容器模式不可能通过。登记为 OD-012。

## Decision

用户于 2026-11-04 明确选择方案 (a)（“采用 a”）。批准来源：用户当前明确指令。

- 新增 Compose 网络 `ot`：普通 bridge（非 internal），Linux 宿主网桥名固定为 `xyv-ot`（`com.docker.network.bridge.name`），供客户 ACL 精确匹配。
- **只有** `gateway` 服务连接 `ot`（另保留 `backend`，供 Edge、控制面和 InfluxDB 访问网关）。控制面、Forgejo、InfluxDB、CONNECT 仍只接 internal `backend`；Edge 仍为 `frontend` + `backend`。
- 网关不发布任何宿主端口；`ot` 只提供出站到 PLC 的路由。
- 网络级出口约束由客户宿主防火墙负责（与 Edge/frontend 的现有原则一致）：客户必须把 `xyv-ot` 的转发流量限制为批准的 PLC OPC UA 端点（常为 TCP 4840）及必要的 DNS，其余拒绝。安装手册给出 Linux `DOCKER-USER` 示例；Windows 容器模式由客户防火墙约束 Docker/WSL 后端的出口。
- 禁止：把 `ot` 加给网关以外的服务；把 `backend` 改为非 internal；为网关发布宿主端口。

## Alternatives

- (b) 声明容器模式不支持网关直连 PLC，工业连接只在原生模式交付：拓扑不变，但容器模式失去产品核心能力，且客户无法在容器模式交付 HMI 实时数据；未采用。
- (c) 网关使用宿主网络（`network_mode: host`）：失去容器内 `influxdb` 名称解析与网络隔离，网关监听口直接暴露在宿主，与现有“只有 Edge 对外”的原则冲突；未采用。

## Consequences

- 正面：容器模式网关可连接工厂网络上的 PLC，F7–F10 可在容器模式验收；Windows 容器模式（Linux 容器在 Docker/WSL 后端）同样获得出站路由。
- 代价与安全：网关成为除 Edge 外唯一具备宿主外出路由的容器。未配置宿主 ACL 时，网关容器可以访问宿主可达的任何地址；网关只主动连接 `gateway.json` 中配置的 OPC UA 端点，但零外呼的网络级保证依赖客户 ACL，必须纳入现场验收 F13。
- 运维：固定网桥名使 ACL 可写；同一宿主只能运行一个 Appliance（已是现状）。

## Compatibility and Migration

升级时 Compose 以新定义重建网络与网关容器；数据、`gateway.json`、审计文件均在持久状态中，不受影响。不改变 GLB、项目格式、Realtime v2 协议或原生模式。

## Validation

- `tests/appliance-runtime.node.test.ts`：逐服务断言只有网关接 `ot`、backend 仍为 internal、`ot` 非 internal 且网桥名为 `xyv-ot`、只有 Edge 发布端口；对旧拓扑该测试失败。
- 实机：容器模式下网关经 `ot` 连接 OPC UA 模拟器/测试 PLC（`/gateway/health` 源为 connected），并验证按手册配置的 `DOCKER-USER` 规则在放行 PLC 的同时拒绝其他出站目的地。结果登记于 EP-APPLIANCE-001。

## Rollback or Supersession

回退即从网关移除 `ot` 并删除网络定义（容器模式随之失去 PLC 通路）。若未来提供按目的地的容器内出口控制（例如专用出口代理或 macvlan 到 OT VLAN），可由新的 ADR 替代本决定。
