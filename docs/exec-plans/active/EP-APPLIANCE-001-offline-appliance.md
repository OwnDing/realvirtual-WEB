---
doc_id: EP-APPLIANCE-001
title: Linux/Windows 完整离线 Appliance
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-04
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
- [x] 现场验收工具包（2026-11-03，第二轮整改第 5 步）：`appliance/docs/FIELD_ACCEPTANCE.zh-CN.md`（权威）/ `.en.md` 的 F1–F15 清单、`appliance/acceptance/FIELD_ACCEPTANCE_RECORD.template.md` 记录模板、只读探针 `appliance/acceptance/probe.mjs`（随归档交付）。
- [x] 本机演练（2026-11-04，用户指令“要测试的话就在本机上进行测试”）：linux-arm64 container 与 native 两种模式按 FIELD_ACCEPTANCE 逐项演练，发现并修复 20 项缺陷；证据与未执行项见 Validation“本机演练”。
- [ ] 自动化与真实环境验证（需要用户提供的现场主机、网络、OPC UA 测试端点与可选 Unity 主机，按 FIELD_ACCEPTANCE 执行）；另受 OD-012 阻塞容器模式的 F7–F10。

## Surprises & Discoveries

- 现有旧手册比最初盘点更接近完整 Appliance 设想，但实现只从缺失的商业 sibling 复制，且手册明确缺少备份恢复和 Windows 全流程证据，不能作为现成交付。
- 公开 CONNECT latest manifest 只有 Windows EXE；Linux CONNECT 是正式 Linux 包的外部硬依赖和当前实包生成证据缺口。
- 归档采用严格文件清单，因此客户配置、证书、信任链和许可证必须放在解包目录之外；否则预检会把新增文件正确识别为归档篡改。
- Caddy internal CA 默认会尝试向本机 trust store 安装根证书；Appliance 显式设置 `skip_install_trust`，避免安装脚本越权改变客户信任边界，根证书只能按手册由客户 IT 分发。
- Oracle Linux 10.2 ARM64 实测表明，只接 Docker `internal` 网络的容器即使声明 `ports` 也不会发布宿主端口；因此 Edge 必须同时接非 internal frontend 和 internal backend，其他服务仍只接 backend。网络级零外呼由宿主 ACL 兜底。

- **2026-11-04 本机演练的发现。** 此前的门禁全部是桩替身或单服务实测，第一次真正端到端运行安装器就连续暴露 20 项缺陷，多数单独即可让安装或验收失败；全部已修复并有回归测试（见 Validation）。规律：(1) 容器模式此前没有任何安装器测试，生命周期测试只跑原生模式且以桩替代 docker/systemd；(2) 权限与属主依赖安装者的 umask 与构建机 uid；(3) 只验证“拒绝访客”而不验证“正确凭据能进”（operator Basic Auth 因 argon2id/bcrypt 不匹配对任何口令都 401，测试依然全绿）；(4) 原生模式从未在 systemd 上真正启动过（引号化的 WorkingDirectory 让每个单元都无法加载，influxd 没有 `--config` 参数）。
- 归档在 macOS 构建时每个文件带 AppleDouble `._*` 与 xattr 记录，而 macOS 的 `tar -t` 会隐藏它们，所以归档核对必须用构建器自己的解析器，不能信任平台 tar。
- 容器模式控制面与 `/diagnostics/` 的代码来自 OCI 镜像（`/app`），而不是归档中的 `runtime/`；本轮一次演练因镜像是旧源码构建而得到过期的诊断页。构建器目前不核对镜像与归档出自同一源码——登记为待跟进，正式发布流程必须同一提交构建两者。
- 失败恢复遇到从未加载的 systemd 单元时，`systemctl disable --now` 返回 5，恢复报告“automatic recovery was not safe”。根因（单元无法加载）已修，但恢复路径对“单元不存在/未加载”仍不宽容，登记待跟进。
- 容器模式网关只在 internal backend 网络，无法到达容器网络之外的 PLC（OD-012）。

## Decision Log

- 2026-11-04：按用户指令“e2e plan (EP-E2E-001)，以及 Appliance plan (EP-APPLIANCE-001) 都进行，要测试的话就在本机上进行测试”，在维护者 Apple M5 上用 Docker Desktop 内的一次性 Debian 12 + systemd + Docker 29 主机演练 linux-arm64；OPC UA 端点是进程外**模拟器**，不是 PLC；没有 Unity 主机，F12 不执行；Windows 与 linux-x64 需要实机。批准来源：用户当前明确指令。
- 2026-11-04：容器模式网关到 PLC 的网络通路会改变已文档化的网络边界，按 AI_SAFETY §1 登记 OD-012，不由 Agent 选择；F7–F10 改在原生模式演练。
- 2026-11-04：原生模式需要主机 git（Forgejo 运行时调用，归档不含）。本轮只把它变成预检阻断项并写入安装手册；是否随包提供 git 并承担 GPLv2 来源义务列入 OD-012。
- 2026-11-04：Forgejo 原生模式关闭 SSH（`DISABLE_SSH = true`）：Appliance 只经入口以 HTTPS 提供 Git，且没有发布或记录过 SSH 端口。
- 2026-11-04：`scripts/test-protected-presentations.mjs`（不在本计划允许路径内）同步修改：Caddyfile 新变量 `OPERATOR_HASH_ALGORITHM` 必须由该 HTTPS 旅程设置（`tests/appliance-runtime.node.test.ts` 强制），并补上“正确 operator 凭据可进、错误被拒”的正向断言。安装手册修改连带重新生成 `public/user-help`（页脚摘要变化）。
- 2026-11-03：第二轮整改第 5 步按用户指令“按你建议的顺序……做到第 5 步”只交付**验收准备**：清单、记录模板与只读探针。实机执行需要用户的硬件和现场环境，Agent 不声称任何实机结果。探针不做任何 PLC 写入、驱动点动或多人写类消息；写入类验收项（F8–F10、F12）只在现场书面授权后手工执行。
- 2026-11-03：ADR-0023 之后 CONNECT 为可选组件，“缺少 CONNECT ARM64 ELF”不再阻断不含 CONNECT 的 Linux 包；含 CONNECT 的发布仍需该发布物。

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

第二轮整改第 5 步（2026-11-03，本地）：`tests/appliance-acceptance-probe.node.test.ts` 6/6——对回环上的仿真 Appliance（Caddy forward_auth 跳转与 401、访问服务登录/会话/账户列表/登出、网关多人守卫）验证：正确的 Appliance 全部通过、仅未提供的角色记为 skipped；故意破坏的 Appliance（网关对无会话开放、查看者在多人房间获得 operator、会话角色错误）恰好 3 项失败；探针只发送 `room_join` / `room_leave`、登出全部会话；证据中不含口令、Cookie 与 CSRF；非回环明文 HTTP 被拒，缺少 `--url https` 或 `--ca` 时拒绝运行。**这不是实机验收**，实机结果待按 FIELD_ACCEPTANCE 执行后登记。远程：PR #31 首轮（`01798e9`）run [`41638516396`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41638516396) 与合入第 4 步后的 `7304421` run [`41743146964`](https://github.com/OwnDing/realvirtual-WEB/actions/runs/41743146964) 七项均通过；2026-11-04T00:31:13Z 合入 `develop`，merge commit `dc7457d`。

### 本机演练（2026-11-04，linux-arm64）——不是现场验收

环境：维护者 Apple M5 上的 Docker Desktop 29.6.2（linux/arm64 VM）；“客户主机”是一次性特权容器（Debian 12、systemd 为 PID 1、Docker Engine 29.9.3 + Compose 5.7.0；原生演练时另装 git），位于用户自定义“工厂网络” `172.30.0.0/24`；同网段放一个 OPC UA **模拟器**（`appliance` 演练脚本，基于 `node-opcua-server`，**不是 PLC**）和一个“工作站”容器（运行归档自带的 `acceptance/probe.mjs`）。主机名经 hosts 解析，DNS 指向不可用的解析器。安装前在主机上启用出站 ACL：只放行回环、已建立连接与私网目的地址，其余丢弃并计数（`XYV-DROP`）；组播单独计数（Docker 建桥时内核发出的 IGMP 成员报告，链路本地、不是连接）。重启演练中该 ACL 以 systemd 单元在 Docker 之前生效。安装均以 `umask 077` 执行。正反对照：ACL 生效后对 `1.1.1.1:443` 的连接超时并计数，外部名称无法解析。

最终制品（同一提交 `5d581cb` 及其祖先构建；候选版本只在 `git archive` 副本中改版本号，`web/` 取自本仓库同期 6.3.27 生产构建）：

| 制品 | 字节 | SHA-256 |
| --- | --- | --- |
| 6.3.27 container 终轮（`88d5829`，v10） | 717,244,156 | `557b004ebacdeac5cc22108a91f2ee1501d60cd1243484a72870a743d1a27c3b` |
| 6.3.28 container 候选（`88d5829`，cand3） | 717,242,280 | `cb0be439a02d64073ef60185e05716a325e12ac69e3f611a8231af77e9d40bf5` |
| 6.3.27 native 终轮（`5d581cb` 工作树，v16） | 717,244,016 | `5be3348cc3a54c931bc13ff09f33bb4ac8869c1fb7978d039830a39e8fd8a845` |
| 6.3.28 native 候选（`5d581cb`，cand4） | 717,244,702 | `05fc4dada77d18151a2eeb3ecf5ffadc769102bad48d6b5ec1415a53d27e8564` |

容器模式的完整 F1–F15 在 v10/cand3 上执行；其后的原生修复（状态根权限、Forgejo 模板）也触及容器路径，因此在 v16（与 `5d581cb` 同内容）上对容器模式复跑 F2、F3、F5：预检 0、安装 0、5 个服务运行、探针 25/0/1。

OCI 基础镜像按锁定的 arm64 child digest 拉取并核对 `linux/arm64`；`edge`/`control` 以 `--network=none` 构建；归档内 4,321–4,323 个清单文件、0 个 AppleDouble。这些是**本地演练构建，不是可分发发布物**：OCI 许可证清单为 NOASSERTION，未履行 Forgejo（GPL）等来源义务。

| 项 | container | native | 说明 |
| --- | --- | --- | --- |
| F1 归档与摘要 | 通过 | 通过 | 主机侧 `sha256sum` 与构建记录一致 |
| F2 预检 | 通过 | 通过 | 仅 `LICENSE_INPUT_NOT_CONFIGURED` 建议项；原生模式含 6 项主机工具（含 git） |
| F3 安装 | 通过 | 通过 | 11–12 s / 9 s；5 个服务运行；原生 edge 为 root，其余为 `xyvirtual` |
| F4 CA 与跳转 | 部分 | 部分 | 指纹带外取得；两主机名链与 SAN 正确；无 CA 客户端被拒；HTTP 301 到同路径 HTTPS。**未在真实终端信任库导入 CA** |
| F5 探针 | 通过 | 通过 | 每次 25 通过 / 0 失败 / 1 跳过（M0 多人未请求）；证据 0600、无口令/Cookie/CSRF；`accounts.json` 用后删除 |
| F6 诊断页 | 部分 | 部分 | 无头 Chromium 156（宿主 GPU）：未登录 HMI 8 通过/4 警告/0 失败，登录后 9/3/0，证书上下文与 `wss://…/gateway/ws` 通过。信任来自固定内部 CA 中间证书公钥，不是信任库；**不是操作终端** |
| F7 网关源/实时/历史 | 阻塞（OD-012） | 通过（模拟器） | 源 `opcua/connected`、5 信号、历史已连接；查看者收到快照；历史查询有数据 |
| F8 写入与审计 | 阻塞（OD-012） | 通过（模拟器） | 操作员写入 `written/Good`、模拟器收到；查看者 `forbidden-role`；输出方向与越界被拒；`writes.jsonl` 每条带用户与角色。**“查看者看不到写控件”是界面项，未验证** |
| F9 强制设置/解除 | 不适用于网关 | 通过（API 级） | 工程师 201×2、操作员 403；访问审计带用户与角色。浏览器侧强制未经界面操作 |
| F10 告警确认/搁置 | — | 通过（API 级） | 操作员确认 201、工程师搁置 201、查看者确认 403、操作员搁置 403；均入审计 |
| F11 服务端项目 | 通过 | 通过 | Forgejo 提交作者为 `acc-engineer`；陈旧基线 409；查看者读 200、写 403 |
| F12 多人协作 | 未执行 | 未执行 | 无 Unity MultiplayerWEB 主机 |
| F13 断网重启 | 通过（F5–F6） | 通过（F5–F7） | 重启后 5 s 就绪；安装至演练全程 `XYV-DROP` 外部丢弃 0、非本地未应答连接 0；证据是计数器与 conntrack（容器内无法读取内核日志） |
| F14 备份/升级/回滚/恢复 | 通过 | 通过 | 6.3.27→6.3.28 升级提交；回滚；按 installId 恢复（错误 installId 被拒，备份后新建的项目被移除）；每步后账户、项目历史、网关配置摘要、Influx bucket 不变；候选预检在运行中的设备上 READY（`PORT_CHECK_SKIPPED_INSTALLED`） |
| F15 卸载与重装 | 通过 | 通过 | 默认卸载保留状态并标记 `uninstalledAt`；卸载后回滚被明确拒绝；重装后 installId、口令、账户、项目历史保留 |

演练中修复的缺陷（均有回归测试；测试在 `tests/appliance-{bundle,preflight,container-install,runtime,diagnostics}.*`）：

1. macOS 构建的归档含 4,951 个 `._*` 与 xattr 记录，主机预检 `BUNDLE_INVALID`；构建器去除元数据并用自带解析器核对归档与清单完全一致。
2. 预检对不含 CONNECT 的发布仍要求 CONNECT 二进制与端口（ADR-0023 后），不含 CONNECT 的发布无法安装。
3. 容器模式 `control.container.json` 为 root 0600，控制面（uid 1000）EACCES 循环重启。
4. 容器内 `forgejo admin` 以 root 执行被 Forgejo 拒绝，管理员引导 60 次后失败。
5. 项目服务令牌在 `data/access` 交给 uid 1000 之后才以 root 0600 写入，服务端项目静默无令牌。
6. 容器模式就绪探测访问宿主回环控制端口（从不发布），每次容器安装都超时回滚。
7. 程序文件权限依赖安装者 umask（`umask 077` 下网关 `MODULE_NOT_FOUND`）。
8. 安装后的发布文件保留构建机 uid（501），同 uid 本地用户可改写程序。
9. Caddy `basic_auth` 默认 bcrypt，安装器写 argon2id：`/appliance/`、`/diagnostics/`、`/git/`、Influx 主机对正确口令也 401。
10. 诊断页证书上下文：控制面无权读取 Caddy 0600 根证书；改为只复制公开证书到独立 `public/` 并单独挂载。
11. 诊断页 WebSocket 写死 CONNECT 路径，网关版必失败；改用控制面公布的路径，未登录 HMI 时给出原因与办法。
12. 文档要求在运行中的设备上先跑候选预检，而预检检查设备自己占用的端口，报 `BLOCKED: EADDRINUSE`。
13. 默认卸载后重装失败（保留的状态仍指向已删除的发布）。
14. base64url 秘密以 `-` 开头时（每个秘密 1/64）被 `influx setup` 当作参数，约 3% 的容器全新安装失败且重试必然再失败。
15. 原生：状态根在严格 umask 下为 0700，服务用户到不了自己的数据。
16. 原生：Forgejo 需要主机 git，未在预检与文档中声明。
17. 原生：每个 systemd 单元的 `WorkingDirectory` 带引号，systemd 拒绝加载，没有任何原生安装能启动。
18. 原生：`influxd` 没有 `--config` 参数，每次启动即退出（Windows WinSW 定义同步修正，未实测）。
19. 原生：Forgejo 首次启动要把 `oauth2.JWT_SECRET` 写回只读的 app.ini，循环重启。
20. 原生：Forgejo 要在状态根下维护 `~/.ssh/authorized_keys` 并失败；关闭 SSH。

未执行或未验证（不得写成通过）：Windows x64 container/native、linux-x64、真实 PLC/OT 网络与 OPC UA 安全模式/证书信任、F12 多人与 Unity、客户证书模式、真实操作终端的 CA 信任与 HMI 界面、容器模式 F7–F10（OD-012）、CONNECT（本轮发布不含）、Browser Gate 中修改后的 HTTPS 旅程（本机 Docker Desktop 不支持 `--network host`，以远程 CI 为准）、原生生命周期测试（需 Linux 主机工具，以远程 Node Gate 为准）。本轮演练脚本与原始证据保存在会话临时目录，未入库。

## Rollback

代码按新增目录回退；已安装环境用 `rollback` 切回上一 release，或 `uninstall` 移除服务并保留数据。证书、Secret、项目和历史数据不随代码回退删除。

## Outcomes & Retrospective

实现已经形成完整的归档构建器、三类本地 OCI 镜像、Linux/Windows 原生与容器生命周期、HTTPS/认证入口、控制面、环境诊断、备份恢复和双语安装文档。构建器会拒绝 fixture、目标格式错误、缺许可证/锁文件、额外文件、摘要不一致或非本地镜像。

2026-11-04 本机演练把 linux-arm64 的 container 与 native 两种模式第一次端到端跑通（F1–F6、F11、F13–F15 两种模式，F7–F10 原生模式），并修复了阻断这些流程的 20 项缺陷；这只是演练证据。计划继续保持 active，关闭仍需：OD-012 决策并补齐容器模式 F7–F10，Windows 与 linux-x64 实机，真实 PLC 与可选 Unity，现场按 FIELD_ACCEPTANCE 的签收。

计划保持 active：Linux ARM64 的主流第三方版本、原生下载摘要、OCI child manifest digest、Notice 和部分实机服务证据已经建立；当前仍没有可合法打入正式 Linux 包的 CONNECT ARM64 ELF，也尚未完成完整依赖锁/OCI 归档、实际 HTTPS Appliance 安装、ARM64 CONNECT 流量、Linux x64 和 Windows 实机证据。取得 CONNECT 发布物后，按 Validation 生成并记录实际包路径、SHA-256、断网冒烟和 Windows/Linux 验收结果，再关闭本计划。
