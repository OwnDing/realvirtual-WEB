---
doc_id: ADR-0009
title: 完整离线 Appliance 的双运行模式与状态边界
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-30
authority: normative
---

# ADR-0009：完整离线 Appliance 的双运行模式与状态边界

## Context

现有 WEB 构建是静态 Vite 产物，部署命令面向 Bunny CDN；客户 workspace 仍可能下载 Node 依赖和 CONNECT。仓库没有可发布的 Appliance，实现曾位于缺失的私有 sibling，现有生成手册也明确标为未发布试点。用户要求同时支持 Linux、Windows、可选容器运行时，并将 WEB、CONNECT、项目 Git、InfluxDB、TLS、健康与环境诊断作为完整离线 Appliance 一次交付。

该决定改变部署模式，引入服务端运行时、持久化服务和证书状态所有权，必须形成 Accepted ADR。

## Decision

1. 使用一个版本化、目标平台专用的运输归档；归档同时包含原生运行时和（当目标支持时）OCI 镜像归档。客户安装不构建镜像、不安装 npm 依赖、不访问 registry。
2. Linux 容器模式全部服务容器化；Windows 容器模式采用混合拓扑，CONNECT 是 Windows 服务，其余服务在 Linux 容器中。原生模式分别由 systemd 和 Windows Service Control Manager 托管。
3. Caddy 作为唯一 HTTPS 入口和内部 CA 实现；控制面使用随包交付的 Node LTS 与纯内置模块，不引入运行时包管理器。Caddy、Node、Forgejo、InfluxDB、CONNECT 和 OCI 归档均为经过摘要校验的打包输入。
4. `/health/live` 与 `/health/ready` 由控制面实现；Caddy只负责 TLS、认证、静态文件和反向代理。就绪探测区分核心服务与外部工业依赖。
5. 状态分为：不可变发布、部署配置、Secrets、PKI、许可证、项目 Git、历史数据、CONNECT 数据、日志和备份。升级只能切换不可变发布；其它状态由稳定持久目录拥有。
6. 部署 origin 是持久化身份的一部分。升级不得改变 HTTPS origin；需要改变时采用单独迁移计划，不把 OPFS/IndexedDB 不可见误判为数据丢失。
7. 构建器对目标依赖失败关闭。当前仓库不包含 Linux CONNECT 或 Windows CONNECT 二进制；正式归档必须由发布流水线提供对应发布物和 SHA-256，测试 fixture 不得进入正式归档。
8. 现有 Deployment Config v2、默认零外呼、离线许可证和客户 profile 继续是 WEB 的权威输入；Appliance 不发明第二套业务配置。

## Alternatives

- 只交付 Dockerfile：拒绝。客户仍需在线拉取基础镜像，并且 Windows 原生 CONNECT、证书信任、升级回滚和持久状态无闭环。
- 只交付 `dist.zip`：拒绝。没有 HTTPS、健康、服务编排或工业同源代理。
- 只支持容器：拒绝。用户明确要求容器运行时可选，部分 OT 主机不允许容器。
- Windows 全容器：拒绝。当前可获得的 CONNECT 发布物是 Windows 进程，不能把未知兼容性包装成 Linux 容器完成。
- 自动安装 Docker/WSL/根证书：拒绝。会改变客户主机和信任根，必须由客户 IT 明确管理。

## Consequences

发布物会明显变大，并且每个 OS/架构分别产包；但每包可在断网环境独立安装。维护者必须发布并锁定多种第三方运行时，生成 SBOM，并对真实 Windows/Linux 主机维护安装验证。Caddy internal CA 简化无企业 PKI 的场景，但根证书分发、备份和轮换成为正式运维职责。

## Compatibility and Migration

WEB、GLB/`rv_extras`、NodeId、项目文档和配置 Schema 不变。旧的 CDN/静态托管路径继续存在。旧 customer workspace 不自动变成 Appliance；通过离线包导入现有项目、配置和许可证。升级保留 origin 和所有持久目录，Deployment Config 仍按既有 v1/v2 兼容契约解析。

## Validation

契约/构建器 Node 测试、脚本静态门禁、控制面 HTTP 测试、诊断页浏览器测试、容器断网冒烟、Windows/Linux 实机安装矩阵、升级回滚和证书负例共同验证。

## Rollback or Supersession

未安装前删除归档即可。安装后用保留的上一发布回滚；卸载默认保留数据。未来若 CONNECT 提供统一容器发布物或采用其它入口代理，必须以新 ADR 替代本记录并提供持久状态迁移。
