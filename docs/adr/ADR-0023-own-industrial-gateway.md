---
doc_id: ADR-0023
title: 自有工业网关（OPC UA 优先），CONNECT 降为可选
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# ADR-0023：自有工业网关（OPC UA 优先），CONNECT 降为可选

## Context

浏览器不能直接说 OPC UA、S7、Modbus 等工业协议。到目前为止，这些协议、信号历史（Historian）、AI Agents 都只能经由上游独立产品 XYvirtual CONNECT 获得；本仓库只拥有浏览器侧契约（`doc-webviewer-interface.md`）。CONNECT 的权利、平台二进制和对应源码不在本项目控制范围内：EP-APPLIANCE-001 记录至今没有可合法打入 Linux 包的 CONNECT ARM64 发布物，商业发布登记 A-05 也因此保持 open。

2026-11-01 用户在缺口整改第 2 步明确选择：“自研网关，CONNECT 可选——新增本项目自有的 Node.js 网关，实现现有 WebSocket Realtime v2 协议（浏览器端不用改），首批支持 OPC UA（node-opcua，MIT 许可），纳入 Appliance；Historian 改为直接读 Appliance 的 InfluxDB。CONNECT 降为可选的第三方适配。”

## Decision

1. **新组件 `gateway/`（XYvirtual Gateway）**：Node.js 22 ESM 服务端程序，独立 npm 包与独立锁文件；运行时依赖仅 `node-opcua`（MIT）与 `ws`（MIT）。它是服务端组件，不进入浏览器包，浏览器代码不得导入它。
2. **北向协议不变**：网关在 `/ws` 实现现有 WebSocket Realtime v2（`init`、`import_request`/`import_answer`、`subscribe`、`snapshot`、`data`），浏览器继续使用已有的 `websocket-realtime` 接口；另提供 `GET /health` 与 `/history/status|signals|query`，形状与 `historian-store.ts` 现有契约一致。
3. **南向源可插拔，首个实现为 OPC UA**：信号必须在网关配置 `gateway.json` 中显式映射（名称 → NodeId、数据类型、方向）；不根据浏览结果自动发布信号。支持 SecurityMode None / Sign / SignAndEncrypt 与匿名或用户名身份；凭据只在服务端配置或环境变量中，不下发浏览器。
4. **写入安全（IO-2/IO-3）**：只接受方向为 `PLCInput*`（PLC 读、Web 写）且在配置中显式 `writable: true` 的信号；类型与范围在网关端校验；全局 `readOnly` 开关默认关闭写入能力需显式开启；写超时报告 `outcome-unknown` 并且绝不自动重试；每一次写尝试（含拒绝）追加到审计 JSONL。第 3 步会把用户身份加入同一审计记录。
5. **Historian**：网关把源侧值变化批量写入 InfluxDB v2（line protocol，有界队列 + 丢弃计数），查询经 Flux 在服务端完成；InfluxDB 令牌只在网关进程内。浏览器的 Historian 可用性由所配置历史端点的 `/status` 决定，不再要求 CONNECT 处于已连接状态。
6. **CONNECT 可选**：Appliance 的 `connect` 组件从必需改为可选；存在时保留现有路由与 UI，缺省时 `gateway` 服务承担 `/gateway/ws` 与 `/gateway/history/*`，部署设置预置 WebSocket Realtime 接口与 Historian 地址。AI Agents 与 CONNECT 自更新、插件目录等仍只在 CONNECT 存在时提供，本 ADR 不重写它们。
7. **其余协议**：S7、Modbus 等以同一源接口追加，各自需要单独的 ExecPlan 与真实设备验收；本 ADR 不宣称已支持。

## Alternatives

- 继续依赖 CONNECT：交付受第三方权利与平台二进制制约，A-05 无法由本项目关闭。用户未采用。
- 完全移除 CONNECT：会无谓破坏已在用的客户部署；可选化同样解除依赖。用户未采用。
- 自行实现 OPC UA 协议栈：安全通道、证书、订阅等正确性风险远高于成熟库，且无收益。未采用。
- 把网关依赖并入根 `package.json`：会让所有浏览器开发者安装服务端依赖，并模糊浏览器/服务端边界。未采用；网关锁文件单独进入 Supply Chain Gate 扫描范围。

## Consequences

- 本项目首次拥有工业协议的服务端代码，需要承担其维护、安全与真实设备验收；自动化测试只使用进程内 OPC UA 测试服务器与 InfluxDB 模拟，**不等于真实 PLC 验收**（IO-4）。
- Supply Chain Gate 增加 `gateway` 作用域；node-opcua 的传递依赖需按 ADR-0019/0022 分诊与判定。
- Appliance 组件、服务单元、Caddy 路由与健康检查增加 `gateway`，`connect` 改为可选，相关清单与测试同步。

## Compatibility and Migration

浏览器协议、信号方向语义（IO-1）、`rv_extras` 与项目格式不变。已有 CONNECT 部署不受影响：`connect` 组件存在时路由与设置保持原样。Historian 的存储格式由网关定义（measurement `signal`、tag `name`、field `value`），与 CONNECT 写入的数据不保证互通。

## Validation

- 网关单元测试：配置校验、写入策略正反例、审计记录、line protocol 转义、Flux 结果解析。
- 集成测试：进程内 node-opcua 服务器 + 网关 + WebSocket 客户端完成 v2 握手、快照、增量、写入成功/拒绝、断线重连；InfluxDB 模拟服务器验证写入与查询。
- 浏览器测试：Historian 在 CONNECT 未连接、但配置了网关历史端点时可用。
- Appliance：组件清单在缺少 `connect` 时有效，生成的 Caddyfile/服务/健康检查包含 `gateway`。
- 真实 PLC、真实 OPC UA 服务器与现场网络：未验证，需单独授权与记录。

## Rollback or Supersession

网关是新增组件；撤回时在 Appliance 中重新把 `connect` 设为必需并删除 `gateway` 服务与路由即可，浏览器不受影响。
