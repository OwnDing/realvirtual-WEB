# XYvirtual Offline Appliance 安装手册

## 1. 范围和准备

每个归档只支持文件名标明的目标：`linux-x64`、`linux-arm64` 或 `windows-x64`。归档同时包含原生运行时和 OCI 镜像；安装后提供 WEB、CONNECT、Forgejo 项目 Git、InfluxDB 历史库、HTTPS 入口、状态页和浏览器诊断。

客户 IT 需要在复制归档前决定：

- 稳定主机名，例如 `xyvirtual-a01.plant.example`，以及 `influx.xyvirtual-a01.plant.example`；
- 静态 IP 或 DHCP reservation，并让两个名称在操作终端和服务器上解析到该地址；
- 企业 CA 证书，或批准 Appliance internal CA 根证书的分发流程；
- `container` 或 `native` 模式；容器模式要求客户预装 Docker Engine/Compose、Docker Desktop/WSL2 或 Podman Compose，安装器不会修改这些平台；
- 80/443 对操作网络开放，CONNECT/3000/8081/8086 只允许 loopback、容器网络或 Windows host bridge；
- 至少 10 GiB 安装余量，另按模型、Git 和历史保留期规划数据盘与备份盘；
- 系统时间和时区正确。离线环境也必须有可靠的 NTP/PTP 或人工校时流程。

## 2. 解包和配置

在联网工程机上完成归档的签名/摘要交接，再通过客户批准介质复制到内网。不要在客户机重新打包文件。

把 `config/appliance.example.json` 复制到**解包目录之外**的受控位置（例如 Linux `/etc/xyvirtual-appliance-input.json`、Windows `C:\ProgramData\XYvirtual Appliance Input\appliance.json`），只修改副本。不要向解包目录增加 `config/appliance.json`：安装器会把归档多文件视为篡改。生产 origin 是 `https://hostname[:port]`；后续升级必须完全保持。`tls.mode`：

- `customer`：`certificate` 和 `privateKey` 指向客户证书链 PEM 和无口令私钥 PEM；证书 SAN 必须同时覆盖主站和 InfluxDB 主机名。若签发根不在证书链文件内，用 `trustBundle` 指向批准的企业根/中间 CA PEM，安装后的 HTTPS 就绪探针会用它做真实链与主机名校验。
- `internal-ca`：Caddy 首次启动时在持久 PKI 目录生成内部 CA 和叶子证书。必须把根证书分发并信任后再交付浏览器。

不要把密码、Influx token 或 Forgejo Secret 写进 JSON；安装器首次安装时生成并保存到管理员可读的持久目录。
如交付需要离线许可证，把 `license.file` 指向同样位于解包目录之外的 `.rvlic` 文件；预检确认可读后，安装器原子复制到持久 `state/license/license.rvlic`，Caddy 以同源 `/license.rvlic` 提供。`null` 表示本次交付不配置商业许可证，并在预检中显示 advisory 警告。

## 3. 一次性预检

预检只读并一次报告全部问题。任何 `FAIL` 都必须处理，不能绕过。

Linux：

```bash
sudo ./preflight.sh --config /etc/xyvirtual-appliance-input.json --mode container
sudo ./preflight.sh --config /etc/xyvirtual-appliance-input.json --mode native
```

Windows 管理员 PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\preflight.ps1 --config 'C:\ProgramData\XYvirtual Appliance Input\appliance.json' --mode container
powershell -NoProfile -ExecutionPolicy Bypass -File .\preflight.ps1 --config 'C:\ProgramData\XYvirtual Appliance Input\appliance.json' --mode native
```

检查范围包括归档全量 SHA-256、目标 OS/架构、依赖入口、磁盘、六个本机端口、DNS、系统时间、客户证书有效期/SAN/密钥匹配和容器运行时。浏览器/GPU 检查在安装后通过 `/diagnostics/` 完成，因为 Shell 不能诚实判断浏览器 API。

## 4. 安装

Linux 容器模式：

```bash
sudo ./install.sh --config /etc/xyvirtual-appliance-input.json --mode container --container-runtime docker
```

Linux 原生模式：

```bash
sudo ./install.sh --config /etc/xyvirtual-appliance-input.json --mode native
```

Windows 容器模式（CONNECT 为 Windows 服务，其余服务为 Linux 容器）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 --config 'C:\ProgramData\XYvirtual Appliance Input\appliance.json' --mode container --container-runtime docker
```

Windows 原生模式：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 --config 'C:\ProgramData\XYvirtual Appliance Input\appliance.json' --mode native
```

安装器只使用 `images/appliance-images.tar` 和 `runtime/`。Compose 强制 `pull=never`；CONNECT、Forgejo、InfluxDB 和控制面只连接 internal backend，只有 edge 同时连接 frontend 并向宿主发布 HTTP/HTTPS 端口。首次安装会显示一次 operator 密码；立即记录到客户密码管理器。Influx token 保存在 `state/secrets/runtime.env`；Forgejo 初始管理员凭证保存在 `state/secrets/forgejo-admin-bootstrap.txt`。两者都只允许管理员和服务账户读取，初次登录后应把 Forgejo 密码轮换进客户密码管理器并删除引导文件。

默认持久位置：

- Linux：程序 `/opt/xyvirtual-appliance`，配置 `/etc/xyvirtual-appliance`，状态 `/var/lib/xyvirtual-appliance`；
- Windows：程序 `%ProgramFiles%\XYvirtual Appliance`，配置/状态 `%ProgramData%\XYvirtual Appliance`。

## 5. Internal CA 信任

首次服务启动后，Caddy 根证书在持久 `pki/caddy-data/caddy/pki/authorities/local/root.crt`。通过 USB、GPO、MDM 或客户证书分发系统传递它，绝不能以未受信任网页下载作为建立信任的第一步。

1. 在服务器上计算 SHA-256 指纹并通过第二通道交给 IT；
2. 在操作终端安装为“受信任的根证书颁发机构”；
3. Firefox 若未启用企业根，需要在自己的证书库导入；
4. iPadOS 导入后还要在“设置 → 通用 → 关于本机 → 证书信任设置”启用完全信任；
5. 从另一台操作终端打开主站和 Influx 主机名，必须没有证书警告；
6. 不允许通过浏览器“继续访问”、关闭 TLS 校验或启动参数跳过错误。

CA 私钥是持久状态。丢失它会迫使所有终端重新信任新根，因此必须纳入加密备份和恢复演练。

## 6. 安装验收

从另一台与操作员相同网络/策略/浏览器的设备验证：

1. HTTP 自动跳到 HTTPS，地址、SAN 和端口正确；
2. `/health/live` 返回 200；`/health/ready` 返回 200 且 release、CONNECT、Forgejo、InfluxDB 都为 `ok`；
3. `/appliance/` 显示状态，`/git/` 进入项目 Git，`https://influx.<host>/` 进入历史库；
4. `/diagnostics/` 的 HTTPS、WebGL2、OPFS 和 Appliance 为通过；按工位需求检查 File System Access、WebGPU 和 WebXR；
5. 载入真实测试模型，完成 OPFS 保存重开和 CONNECT WebSocket 断开/重连；
6. 在出口被阻断时重复启动和主要流程，确认没有外部请求或在线降级下载。

## 7. 升级、回滚、备份和卸载

建议每次升级前先生成并验证一份客户可恢复的一致性备份：

```bash
sudo ./backup.sh
```

备份会短暂停止写服务，复制配置、PKI、许可证、Secret、Git、InfluxDB 和 CONNECT 数据，写逐文件摘要，再恢复原版本。Windows 使用 `backup.ps1`。

将新归档完整复制到主机并运行它自己的预检，然后：

```bash
sudo ./upgrade.sh --config /etc/xyvirtual-appliance-input.json --mode container
```

升级先完整验证候选和 origin，再执行短暂停机切换，等待控制面与真实受信任 HTTPS readiness 后才记录新 current，并保留旧 release。若 CONNECT、Forgejo 或 InfluxDB 版本变化，安装器还会在切换前自动生成一致性全备份；候选失败时先恢复这份备份再启动旧版本。此类升级不能直接用裸 `rollback` 降级共享数据，必须按安装器提示用对应一致性备份恢复。只有未发生数据服务版本变化时，业务验收不通过才可直接执行：

```bash
sudo ./rollback.sh
```

恢复备份需要当前 `installId`，防止把另一台 Appliance 的数据覆盖进来：

```bash
sudo ./restore.sh --backup /var/lib/xyvirtual-appliance/backups/<backup> --confirm-restore <installId>
```

默认卸载只移除服务和程序，保留全部持久状态：`sudo ./uninstall.sh`。永久删除必须同时给出 `--purge-data --confirm-purge <installId>`；执行前另做客户批准的外部备份。

## 8. 常见问题

- `BUNDLE_INVALID`：文件数量、大小或摘要改变；重新从批准介质复制，不能修改 manifest。
- `RUNTIME_MISSING`：发布包不完整；不能联网补装。
- `DNS_UNRESOLVED`：服务器自己也必须解析两个正式名称；修改客户 DNS/hosts 后重跑。
- `CERT_HOSTNAME_MISMATCH`：重新签发带两个 SAN 的证书，不能关闭校验。
- `PORT_UNAVAILABLE`：识别具体监听者；不要终止未知进程，改拓扑或正式端口配置。
- `/health/live` 通过而 `/health/ready` 失败：入口活着但 release 或后端服务失败，按状态页稳定 code 定位。
- HTTPS 页面无法连 CONNECT：确认使用同源 `/connect/` 或 `wss://`，并检查代理 Upgrade、认证和防火墙；不要退回 `ws://`。
- 升级后浏览器项目看似消失：先检查 origin 是否变化。不要创建新项目覆盖原状态。
