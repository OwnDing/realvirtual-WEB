---
doc_id: CONTRACT-GATEWAY-001
title: XYvirtual Gateway 配置、接口与写入审计契约
status: approved
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# XYvirtual Gateway 配置、接口与写入审计契约

依据 [ADR-0023](../adr/ADR-0023-own-industrial-gateway.md)。实现位于 `gateway/`，自动化验证见 `gateway/test/`；该验证使用进程内 OPC UA 测试服务器，**不等于真实 PLC 验收**。

## 1. 配置 `gateway.json`（schemaVersion 1）

严格校验，未知键一律拒绝；任一字段错误进程以退出码 2 结束并指出字段路径。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 固定为 `1` |
| `listen.host` / `listen.port` | 否 | 默认 `127.0.0.1:5200` |
| `websocketPath` | 否 | 默认 `/ws` |
| `apiKeyEnv` | 否 | 环境变量名；设置后 WebSocket 需 `?apikey=`、`/history/*` 需 `X-API-Key` |
| `allowedOrigins` | 否 | 浏览器 Origin 白名单（CORS 与 WebSocket）；为空时不做 Origin 限制，依赖入口代理 |
| `readOnly` | 否 | 默认 `false`；为 `true` 时拒绝全部写入 |
| `trustProxyIdentity` | 否 | 默认 `false`；`true` 时只接受入口代理注入的 `X-Rv-User`/`X-Rv-Role`（[ADR-0024](../adr/ADR-0024-hmi-roles-and-server-projects.md)），无身份的 WebSocket 与 `/history/*` 返回 401；只能在网关仅经 Appliance HTTPS 入口可达时开启 |
| `maxClients` | 否 | 默认 200 |
| `audit.path` | 是 | 写入审计 JSON Lines 文件 |
| `source` | 视情况 | 缺省 = 未配置网关，此时 `signals` 必须为空；当前只支持 `kind: "opcua"` |
| `signals[]` | 视情况 | 有 `source` 时至少 1 条，最多 20000 条 |
| `history` | 否 | InfluxDB v2；`tokenEnv` 与 `tokenFile` 二选一 |

`source`（OPC UA）：`endpointUrl`（`opc.tcp://`）、`securityMode`（`None`/`Sign`/`SignAndEncrypt`，与 `securityPolicy` 必须同为 None 或同为非 None）、`securityPolicy`（`None`/`Basic256Sha256`/`Aes128_Sha256_RsaOaep`/`Aes256_Sha256_RsaPss`）、`identity`（`anonymous`，或 `username` + `passwordEnv`，后者要求非 None 安全模式）、`publishingIntervalMs`、`samplingIntervalMs`、`writeTimeoutMs`、`pkiDir`（未知服务器证书默认拒绝）。

`signals[]`：`name`（WEB 信号名，唯一）、`nodeId`（`ns=…;s=|i=|g=|b=…`）、`type`（`PLCInputBool|Int|Float`、`PLCOutputBool|Int|Float`，方向按 PLC 视角，IO-1）、`writable`（默认 `false`，只允许 `PLCInput*`）、`min`/`max`（数值型）、`dataType`（写入用 OPC UA 类型；整数类型自动执行其取值范围，64 位整数不可写）、`history`（默认 `true`）、`description`。

密钥（API key、OPC UA 密码、InfluxDB 令牌）只能来自环境变量或 0600 文件，不得写入 `gateway.json`（IO-5）。

## 2. 北向接口

- `WS <websocketPath>`：WebSocket Realtime v2，与 `src/interfaces/signal-transport-core.ts` 的客户端一致：`init`（亦为心跳）、`import_request` → `import_answer { signals, signalTypes }`、`subscribe` → `snapshot`、源侧变化 → `data`（仅变化值，按事件循环批量合并）、客户端 `data` = 写请求。网关额外回发 `write_result { results: { <name>: { outcome, status?|reason? } } }`；现有浏览器忽略该消息。
- `GET /health`：无需密钥、不含任何密钥；字段 `status`、`product`、`version`、`readOnly`、`signals`、`clients`、`source { kind, state, endpointUrl, securityMode, lastError, badSignals }`、`history { enabled, connected }`、`auditFailures`。`source.state` ∈ `unconfigured|connecting|connected|reconnecting|error|stopped`。
- `GET /history/status`：与 `historian-store.ts` 的 `HistorianStatus` 同形（另含 `queued`）。
- `GET /history/signals`：`[{ name, active }]`，只含 `history !== false` 的信号。
- `GET /history/query?from=<ISO>&to=<ISO>&signal=<name>…`：`[{ signal, ts[], values[] }]`；1–50 个已配置信号、`from < to`、跨度不超过 `maxRangeDays`；超过 `maxPointsPerSeries` 时服务端按窗口取平均。

## 3. 写入语义（IO-2、IO-3）

一次写入仅在以下条件同时满足时到达 PLC：非 `readOnly`；信号已配置、为 `PLCInput*` 且 `writable: true`；值的类型精确匹配（`"1"` 不是 Bool，`1.5` 不是 Int）且在 `dataType` 与 `min/max` 范围内。拒绝原因代码稳定：`read-only`、`unknown-signal`、`not-writable-direction`、`not-writable`、`invalid-type`、`out-of-range`，以及 `trustProxyIdentity` 下角色低于 operator 时的 `forbidden-role`。

源侧结果：`written`（OPC UA 返回 Good）、`failed`（返回 Bad，附状态名）、`unknown`（超时、断线或会话丢失）。**`unknown` 绝不自动重试**；调用方须先读回状态再决定。

## 4. 审计记录

`audit.path` 中每次写尝试（含拒绝）一行 JSON：`time`、`client`（连接 ID@远端地址/客户端名）、`user`、`role`（来自入口身份；未启用 `trustProxyIdentity` 时为 `null`）、`signal`、`requested`、`value`（被接受时的规范化值）、`outcome`（`rejected|written|failed|unknown`）、`reason` 或 `status`。行按写入顺序串行追加，文件权限 0640；追加失败计入 `/health` 的 `auditFailures`。

## 5. 历史存储

InfluxDB v2：measurement `signal`、tag `name`、float field `value`（Bool → 0/1），毫秒精度；只记录质量为 good 的值变化。写入为有界队列批量提交，超出 `maxQueue` 丢弃最旧点并计入 `droppedPoints`；失败的批次放回队列。与 CONNECT 写入的历史数据不保证互通。

## 6. 兼容性

新增组件，不改变浏览器协议、`rv_extras`、项目或部署格式。配置格式的破坏性变化必须提升 `schemaVersion` 并提供迁移。
