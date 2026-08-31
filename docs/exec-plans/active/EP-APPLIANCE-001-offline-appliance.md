---
doc_id: EP-APPLIANCE-001
title: Linux/Windows 完整离线 Appliance
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-30
authority: normative-process
---

# EP-APPLIANCE-001：Linux/Windows 完整离线 Appliance

## Purpose

交付可在断网 Windows/Linux 主机安装、升级、回滚和监控的完整 XYvirtual Appliance，包含 WEB、CONNECT、Forgejo、InfluxDB、HTTPS、健康和环境诊断，并支持容器/原生两种运行方式。

## Scope

- Approved 产品规格、Accepted ADR、Bundle/健康/诊断契约和验收矩阵；
- `appliance/` 中的运行拓扑、控制面、诊断页、配置和安装运维手册；
- 版本化离线包构建器、依赖锁、全量摘要、SBOM/许可证入口；
- Linux shell/systemd、Windows PowerShell/SCM、Docker/Podman Compose；
- 安装、升级、回滚、卸载、备份元数据、证书两种模式、环境预检；
- Node/浏览器测试、断网容器冒烟和构建门禁。

## Non-goals

- 云端控制台、自动回连、自动安装容器运行时/WSL/根 CA；
- 修改 PLC 写语义、GLB/rv-ODT、项目格式或统一配置优先级；
- 用测试 Stub 替代真实 CONNECT/Forgejo/InfluxDB 发布物。

## Required Documents and Decisions

- [`DEVELOPMENT_CONSTITUTION`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`AI_SAFETY`](../../governance/AI_SAFETY.md)、[`DOCUMENT_PRIORITY`](../../governance/DOCUMENT_PRIORITY.md)；
- Approved [`PS-APPLIANCE-001`](../../product-specs/OFFLINE_APPLIANCE.md)；
- Accepted [`ADR-0009`](../../adr/ADR-0009-offline-appliance.md)；
- [`CONTRACT-APPLIANCE-BUNDLE-001`](../../contracts/OFFLINE_APPLIANCE_BUNDLE.md)；
- 既有 [`PS-CONFIG-001`](../../product-specs/DEPLOYMENT_IDENTITY_EGRESS.md)、[`PS-CONFIG-002`](../../product-specs/UNIFIED_CONFIGURATION.md)、[`ADR-0007`](../../adr/ADR-0007-offline-license-evidence.md)。

## Current Repository Facts

- 开始分支 `develop`，工作树干净，版本 `6.3.27`，Node 要求 `>=18`；当前主机 Linux arm64，Docker/Compose 可用。
- 仓库没有 Dockerfile 或可发布 appliance；`npm run deploy` 指向 Bunny。
- `scripts/_workspace-lib.mjs` 有旧 appliance 手册字符串，但明确声明未发布，真正目录来自当前缺失的私有 sibling。
- 公共 CONNECT manifest 2026-08-30 现场读取只提供 Windows 1.2.2+40 EXE；Linux 正式发布物必须由维护者交付，打包器不得假造。

## State Ownership and Compatibility

不可变 release 与持久 config/secrets/pki/license/forgejo/influxdb/connect/backups 分离。升级保持 HTTPS origin，不修改 WEB 的 Deployment Config v2 状态所有权，不改变 GLB、NodeId、项目/文档/资产 ID 或保存格式。

## Allowed Paths

- `appliance/**`
- `scripts/build-offline-appliance.*`
- `tests/appliance-*.test.*`
- `e2e/appliance-*.spec.ts`
- `package.json`
- `docs/product-specs/OFFLINE_APPLIANCE.md`
- `docs/architecture/OFFLINE_APPLIANCE.md`
- `docs/contracts/OFFLINE_APPLIANCE_BUNDLE.md`
- `docs/adr/ADR-0009-offline-appliance.md`
- `docs/exec-plans/active/EP-APPLIANCE-001-offline-appliance.md`
- 文档索引、验收矩阵和必要治理登记

## Forbidden Paths

- GLB/rv-ODT Schema 与客户模型
- PLC/工业信号方向和写逻辑
- 现有生成围栏
- 用户未授权的提交、推送、发布和外部部署

## Milestones

1. 冻结产品、架构、Bundle、健康、诊断和状态所有权契约。
2. 黄金切片：Linux container 归档、预检、安装、HTTPS、控制面、完整服务编排、升级回滚。
3. Linux native 与 Windows container/native 安装器和服务注册。
4. 浏览器诊断、证书手册、备份恢复和运维手册。
5. 全部自动化、断网冒烟、实机证据与计划关闭。

## Progress

- [x] 用户批准 Linux、Windows、容器可选与完整 Appliance 范围。
- [x] 产品规格、ADR、架构与 Bundle 契约建立。
- [x] 离线构建器和运行拓扑实现。
- [x] 双平台生命周期脚本和诊断实现。
- [ ] 自动化与真实环境验证。

## Surprises & Discoveries

- 现有旧手册比最初盘点更接近完整 Appliance 设想，但实现只从缺失的商业 sibling 复制，且手册明确缺少备份恢复和 Windows 全流程证据，不能作为现成交付。
- 公开 CONNECT latest manifest 只有 Windows EXE；Linux CONNECT 是正式 Linux 包的外部硬依赖和当前实包生成证据缺口。
- 归档采用严格文件清单，因此客户配置、证书、信任链和许可证必须放在解包目录之外；否则预检会把新增文件正确识别为归档篡改。
- Caddy internal CA 默认会尝试向本机 trust store 安装根证书；Appliance 显式设置 `skip_install_trust`，避免安装脚本越权改变客户信任边界，根证书只能按手册由客户 IT 分发。
- Oracle Linux 10.2 ARM64 实测表明，只接 Docker `internal` 网络的容器即使声明 `ports` 也不会发布宿主端口；因此 Edge 必须同时接非 internal frontend 和 internal backend，其他服务仍只接 backend。网络级零外呼由宿主 ACL 兜底。

## Decision Log

- 2026-08-30：用户明确批准 Linux + Windows、容器运行时可选、完整 Appliance，作为本计划激活与 ADR 接受依据。
- 2026-08-30：沿用现有产品设想，将完整范围定义为 WEB、CONNECT、Forgejo、InfluxDB、HTTPS/认证、健康和诊断；不把客户安装阶段联网当作降级路径。
- 2026-08-30：缺少真实平台二进制时构建失败，不允许 fixture 冒充正式服务。
- 2026-08-30：依赖基线锁定 Node 24.20.0 LTS、Caddy 2.11.4、Forgejo 15.0.7 LTS、InfluxDB OSS 2.9.1、influx CLI 2.8.0、WinSW 2.12.0；InfluxDB 保持 v2 是因为现有 setup、Flux、备份和 API 契约，不跟随会转向 v3 的 `latest`。

## Validation

- `./scripts/verify.sh governance`
- `./scripts/verify.sh static`
- Appliance Node tests、浏览器诊断测试、构建器 fixture 测试
- `./scripts/verify.sh node`、`./scripts/verify.sh browser`、`./scripts/verify.sh build`
- Linux 容器 `--network none`/禁 pull 安装冒烟
- Windows container/native、Linux native 和真实 CONNECT/InfluxDB/Forgejo 人工验收

截至 2026-08-30，以下验证已通过：治理门禁；静态/TypeScript 门禁；Appliance Node 测试（4 文件、16 项）；Chromium 诊断测试（1 项）；全仓浏览器门禁（8 shards 共 1,397 项，单列 overlay 11 项）；生产构建；全部 MJS/Bash 语法检查；Compose profile 解析；`git diff --check`。

全仓 Node 门禁为 69 文件通过、2 跳过、1 失败（721 项通过、7 跳过、1 失败）。唯一失败是既有 `tests/bundle-chunk.node.test.ts` 只接受 `dist/assets/index-*.js`，而当前生产构建的真实入口是 `dist/assets/app-*.js`；本任务未修改该测试或 Vite 入口，也未放宽门禁。真实四路径和断网容器冒烟仍需正式 CONNECT 二进制、锁定的 OCI 基础镜像/第三方运行时及 Windows/Linux 验收主机，不能用 fixture 代替。

Linux ARM64 实机证据（Oracle Linux 10.2、AArch64、Docker 29.7.2、Compose 5.5.0）：

- 五个 OCI 输入均解析并拉取平台 child manifest digest；在 `--network none` 下运行版本/架构命令通过。
- Node、Caddy、Forgejo、InfluxDB 和 influx CLI 的官方 ARM64 归档与上游 SHA-256/SHA-512 完全匹配；五个 ELF 在宿主直接运行并报告所选版本。
- 真实 Forgejo 15.0.7 和 InfluxDB 2.9.1 在 internal backend 初始化成功；发现单 internal 网络阻止宿主端口发布后，修正为 Edge 双网络。Caddy 同时接 frontend/backend 后，从宿主代理访问两服务均返回 HTTP 200。
- Compose 展开确认 Edge 网络为 `backend,frontend`，CONNECT 仅 `backend`，backend `internal=true`，frontend 非 internal，五项 `pull_policy=never`。
- 镜像构建器使用真实 ARM64 base lock 完成输入平台检查，并按设计在缺少 CONNECT ELF 时以 `Linux CONNECT binary is missing or does not match` 失败关闭。

## Rollback

代码按新增目录回退；已安装环境用 `rollback` 切回上一 release，或 `uninstall` 移除服务并保留数据。证书、Secret、项目和历史数据不随代码回退删除。

## Outcomes & Retrospective

实现已经形成完整的归档构建器、三类本地 OCI 镜像、Linux/Windows 原生与容器生命周期、HTTPS/认证入口、控制面、环境诊断、备份恢复和双语安装文档。构建器会拒绝 fixture、目标格式错误、缺许可证/锁文件、额外文件、摘要不一致或非本地镜像。

计划保持 active：Linux ARM64 的主流第三方版本、原生下载摘要、OCI child manifest digest、Notice 和部分实机服务证据已经建立；当前仍没有可合法打入正式 Linux 包的 CONNECT ARM64 ELF，也尚未完成完整依赖锁/OCI 归档、实际 HTTPS Appliance 安装、ARM64 CONNECT 流量、Linux x64 和 Windows 实机证据。取得 CONNECT 发布物后，按 Validation 生成并记录实际包路径、SHA-256、断网冒烟和 Windows/Linux 验收结果，再关闭本计划。
