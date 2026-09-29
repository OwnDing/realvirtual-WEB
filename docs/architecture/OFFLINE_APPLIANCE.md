---
doc_id: ARCH-APPLIANCE-001
title: Offline Appliance 架构
status: approved
owner: architecture
last_reviewed: 2026-09-29
authority: normative
---

# Offline Appliance 架构

## 1. 组件

```text
Browser -- HTTPS --> Caddy edge
                       |-- /                 --> immutable WEB release
                       |-- /present/         --> isolated presentation WEB payload
                       |-- /api/access/v1/*  --> control plane access module + private SQLite/GLB
                       |-- /health,/appliance,/diagnostics --> control plane
                       |-- /connect, WS      --> CONNECT
                       |-- /git              --> Forgejo
                       `-- /api/v2,/influx    --> InfluxDB

control plane --> release hash verification + bounded service probes
CONNECT       --> customer-approved OT interfaces
Forgejo       --> persistent project repositories
InfluxDB      --> persistent signal history
```

Caddy 是唯一局域网入口。CONNECT、Forgejo、InfluxDB 和控制面默认只监听 loopback、容器网络或 Windows host/container 专用桥；不得直接暴露 PLC 控制端口。

容器 backend 网络为 internal，CONNECT、Forgejo、InfluxDB 和控制面只连接 backend；只有 Edge 同时连接 frontend，并且只有 Edge 映射 80/443。单一 internal 网络会阻止部分 Docker 引擎发布宿主端口，因此不能让 Edge 只接 backend。默认 Caddy 配置只访问声明的内网 upstream；强制网络级零外呼仍由客户宿主防火墙/ACL 验收。

## 2. 运行拓扑

- Linux container：Caddy/control/CONNECT/Forgejo/InfluxDB 五个容器，静态 WEB 作为只读发布卷。
- Linux native：同样五个逻辑服务由 systemd 管理。
- Windows container：Caddy/control/Forgejo/InfluxDB 在 Linux 容器；CONNECT 由 Windows SCM 管理，edge 通过 host gateway 访问。
- Windows native：全部逻辑服务由 Windows SCM 管理。

两个模式消费相同的部署配置、证书、许可证和数据目录。切换运行模式不是升级的隐式副作用；必须停止旧拓扑、备份配置并通过同一 readiness 后切换。

## 3. 失败边界

- Caddy/control 失败：liveness 失败，应由服务管理器重启。
- WEB 发布损坏、配置/许可证缺失或核心服务失败：readiness 503，不自动修改数据。
- PLC/外部工业接口失败：状态 degraded，不重启入口或 CONNECT，不自动重试非幂等写。
- 升级候选失败：不切换 current；当前版本继续服务。
- 写操作超时：Appliance 不代表 CONNECT/PLC 自动重试；沿用工业接口现有结果不确定规则。

## 4. 安全与缓存

入口统一执行 HTTPS、认证、CSP、安全头、WebSocket Upgrade 和审计友好的最小日志。`index.html`、`settings.json`、许可证和发布 manifest 使用 no-cache/revalidate；内容哈希资产 immutable；GLB 采用版本文件名或 revalidate。Secret 不进入 WEB 根、Compose YAML、命令行、健康 JSON 或支持包。

受保护演示见 [ADR-0012](../adr/ADR-0012-protected-presentations.md)：仅 `/present/` 专用静态入口和 `/api/access/v1` 由业务会话模块独立鉴权，模型逐请求检查分享范围、期限、撤销和账户状态。该前缀不使用 operator Basic Auth；其余工作台、配置和服务入口仍要求 operator 凭据。展示会话不授予 CONNECT/MCP/工业写权限。Caddy 使用显式 route 顺序，在静态回退之前完成路径匹配与认证。专用入口不拷贝主 public 目录，没有回退至工作台。

控制面独占 `state/data/access` 的 SQLite v1 和不可变 GLB；Edge 不挂载这个目录。演示响应使用 no-store 和限制 CSP；数据库故障拒绝授权。数据纳入停止服务的一致性备份，恢复后撤销全部恢复链接并清除会话。部署及迁移步骤见 [演示运行手册](../runbooks/PROTECTED_PRESENTATIONS.md)。

状态与生命周期的规范定义见 [`CONTRACT-APPLIANCE-BUNDLE-001`](../contracts/OFFLINE_APPLIANCE_BUNDLE.md)。
