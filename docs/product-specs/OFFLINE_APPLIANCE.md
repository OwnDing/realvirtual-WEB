---
doc_id: PS-APPLIANCE-001
title: 完整离线 Appliance
status: approved
owner: product
last_reviewed: 2026-08-30
authority: normative
---

# 完整离线 Appliance

## 1. 目标

客户在与互联网物理隔离的 Windows 或 Linux 主机上，使用一份经过校验的版本化安装包部署 XYvirtual WEB、XYvirtual CONNECT、项目 Git 服务、InfluxDB 历史库、HTTPS 入口、健康检查和环境诊断。安装、升级、回滚、重启恢复和卸载均不得访问互联网。

本规格由用户 2026-08-30 的明确指令批准：服务器操作系统同时支持 Linux 与 Windows；容器运行时可选；完整 Appliance 属于本阶段范围。

## 2. 支持矩阵

| 主机 | 容器模式 | 原生模式 | CONNECT |
| --- | --- | --- | --- |
| Linux x64/arm64 | 全部服务运行在 Linux 容器中 | 全部服务由 systemd 托管 | 对应架构的 Linux CONNECT 发布物 |
| Windows x64 | WEB/入口、控制面、Git、历史库运行在 Linux 容器中，CONNECT 作为 Windows 服务 | 全部服务作为 Windows 服务运行 | Windows CONNECT 发布物 |

安装包按一个 `target` 构建；目标平台所需的运行时、服务二进制或 OCI 镜像必须全部在包内。缺少 CONNECT、Node、入口代理、Forgejo、InfluxDB 或容器镜像时，打包与安装都失败，禁止在线补齐或用占位程序继续。

## 3. 用户可观察行为

1. 客户将归档复制到目标主机，运行一次预检，再选择 `container` 或 `native` 安装；首条安装命令开始后不需要互联网、npm、Git、软件仓库或镜像仓库。
2. 安装脚本验证发布签名/摘要、目标平台、端口、磁盘、DNS、系统时间、证书输入和服务依赖；一次报告全部问题，不静默修复客户网络。
3. 安装成功后，稳定 HTTPS 地址提供 WEB、环境诊断、Appliance 状态、项目 Git、历史库 API/UI 和经同源代理保护的 CONNECT 路由。
4. `GET /health/live` 只表示入口与控制面存活；`GET /health/ready` 同时报告发布完整性和各服务状态。工业设备、PLC 或外部数据源断开作为依赖诊断，不让入口进程陷入重启循环。
5. 升级先完整校验候选和持久数据兼容性，再短暂停机启动候选；健康通过后原子提交 release 指针并保留上一版本。数据服务版本变化时先自动创建一致性全备份，失败则先恢复再启动旧版，禁止把已迁移数据直接交给旧版。配置、证书、许可证、项目仓库、历史数据和 CONNECT 状态不被候选包覆盖。
6. 卸载默认只移除程序和服务，保留数据、证书和备份；删除持久数据必须使用独立参数和明确确认。
7. 浏览器诊断一次检查浏览器版本、secure context、WebGL、WebGPU、WebXR、File System Access、OPFS 往返写入、存储持久化、证书信任结果和 WSS/服务连通性，并导出脱敏 JSON。
8. 运行时默认零外呼；安装与升级在断网环境下完成，且容器模式强制 `pull=never`。

## 4. HTTPS 与 Origin

- HTTPS 是功能前提。HTTP 只允许把请求重定向到 HTTPS，不作为生产入口。
- 首选客户企业 CA 签发的证书。没有企业 CA 时，入口代理在本机生成离线内部 CA 和带 DNS/IP SAN 的叶子证书；根证书通过客户批准的 GPO、MDM 或人工流程分发并核对 SHA-256 指纹。
- 不把“点击继续访问”、关闭 TLS 校验、`NODE_TLS_REJECT_UNAUTHORIZED=0` 或浏览器启动参数当作信任方案。
- 升级和证书轮换必须保持 `scheme + host + port`；改变 origin 会隔离既有 OPFS、IndexedDB 和 localStorage，必须作为显式迁移项目处理。
- HTTPS 页面到 CONNECT、MQTT、TwinCAT 或其他 WebSocket 服务必须使用 `wss://` 或同源反向代理，禁止产生 mixed content。

## 5. 能力分级

- 基础必需：受信任 HTTPS、`window.isSecureContext`、WebGL2 实际上下文、OPFS 实际写/读/删、基础 WEB 与同源静态资源。
- 创作工作站必需：File System Access（仅支持该 API 的浏览器）；不支持时保留现有文件选择降级并明确显示限制。
- 增强：WebGPU adapter 与所需 limits/features。
- 场景启用时必需：WebXR `immersive-vr`/`immersive-ar` 支持；最终验收仍需真实头显和运行时。

浏览器最低版本由版本化支持矩阵声明，不能仅按 user-agent 猜测。当前自动化基线是 Chromium；把 Firefox、Safari 或移动浏览器宣布为完整支持前必须增加对应真实验证。

## 6. 数据、备份与安全

- 不可变程序放在版本发布目录；配置、密钥、证书、许可证、项目 Git、InfluxDB、CONNECT、日志和备份分别放在持久目录。
- 安装包不携带客户 Secret；安装时生成的密码和令牌只写入管理员可读文件。控制面和健康输出不得返回值。
- WEB/CONNECT/历史库/Git 共享同一认证边界；不能只保护 HTML。健康端点可不认证，但只返回最小状态和稳定错误码。
- 备份覆盖所有持久目录和恢复清单；升级前自动创建配置/元数据备份。历史数据大体积备份策略由客户运维选择，但不得伪称不存在的备份成功。
- 发布包含 SHA-256 清单、SBOM、构建来源、许可证和第三方告知；对应源码交付方式由维护者与法务确认并在离线手册中可达。

## 7. 非目标

- 不在本阶段建设云端租户、远程升级控制台或越过客户防火墙的回连服务。
- 不自动安装或删除 Docker Desktop、Docker Engine、Podman、WSL、Hyper-V 或客户证书根。
- 不替代 PLC/OT 安全审查，不默认暴露 CONNECT 或工业端口到局域网。
- 不承诺所有浏览器、GPU、头显和驱动组合；支持矩阵之外只输出诊断。

## 8. 验收

- 四个支持路径至少通过脚本级安装/升级/回滚测试；Linux 容器路径必须在断网容器主机完成真实冒烟。
- 新装、重复安装、重启、自签信任、客户证书、错误 SAN、过期证书、端口冲突、损坏归档、缺少依赖和回滚均有可观察结果。
- 从受信任客户浏览器完成 WebGL 场景、OPFS 往返、可选 WebGPU/WebXR、WSS 重连和零外呼检查。
- 升级后 origin、配置、许可证、项目 Git、历史数据和 CONNECT 状态保持；失败时上一版本继续可用。

实施与证据见 Accepted [`ADR-0009`](../adr/ADR-0009-offline-appliance.md)、[`CONTRACT-APPLIANCE-BUNDLE-001`](../contracts/OFFLINE_APPLIANCE_BUNDLE.md) 和 Active [`EP-APPLIANCE-001`](../exec-plans/active/EP-APPLIANCE-001-offline-appliance.md)。
