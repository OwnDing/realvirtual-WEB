---
doc_id: CONTRACT-APPLIANCE-BUNDLE-001
title: Offline Appliance Bundle v1 契约
status: approved
owner: architecture
last_reviewed: 2026-08-30
authority: normative
---

# Offline Appliance Bundle v1 契约

## 1. 运输归档

文件名为 `xyvirtual-web-appliance-<version>-<target>.tar.gz`，解包后顶层必须包含：

```text
appliance-manifest.json
manifest.sha256
install.sh / install.ps1
upgrade.sh / upgrade.ps1
rollback.sh / rollback.ps1
backup.sh / backup.ps1
restore.sh / restore.ps1
uninstall.sh / uninstall.ps1
preflight.sh / preflight.ps1
runtime/
web/
config/
docs/
licenses/
sbom/
images/                 # 支持 container 时必需
```

`target` 稳定枚举为 `linux-x64`、`linux-arm64`、`windows-x64`。路径使用 POSIX `/`，不得包含绝对路径、`..`、设备名或符号链接逃逸。

## 2. Manifest

`appliance-manifest.json` 使用 `schemaVersion: 1`：

```json
{
  "schemaVersion": 1,
  "product": "xyvirtual-web-appliance",
  "version": "6.3.27",
  "target": "linux-x64",
  "createdAt": "2026-08-30T00:00:00.000Z",
  "modes": ["container", "native"],
  "originIdentity": "scheme-host-port",
  "services": ["edge", "control", "web", "connect", "forgejo", "influxdb"],
  "components": [{ "id": "forgejo", "version": "...", "license": "MIT", "licenseFiles": ["licenses/third-party/forgejo-MIT.txt"] }],
  "files": [{ "path": "web/index.html", "bytes": 123, "sha256": "..." }]
}
```

`files` 覆盖除 manifest 本身和 `manifest.sha256` 外的每个普通文件，按路径排序且不得重复。SHA-256 使用小写 hex。安装器在任何写系统状态前校验全部文件、目标平台和必需服务；多文件、少文件、摘要不符均失败。

`components` 记录每个运行时的稳定 ID、版本和许可证。若 CONNECT、Forgejo 或 InfluxDB 版本在两个 release 间变化，安装器必须把升级视为可能的数据迁移：升级前创建一致性全备份；未用该备份恢复前不得把已迁移数据交给旧版本。

`manifest.sha256` 是 manifest 文件自身的 SHA-256。可选发布签名文件只签 manifest 字节，不替代摘要全量验证。

## 3. 依赖输入

维护者侧 `appliance/dependencies/<target>.json` 声明每个必需输入的稳定 ID、文件名、版本、SHA-256、用途和许可证。正式构建不得：

- 从 `latest` URL 无锁下载；
- 缺少摘要时继续；
- 用测试 fixture、空文件、shell Stub 或固定健康返回替代服务；
- 在客户安装阶段 pull 镜像、npm install 或系统包安装。

容器归档内的镜像必须重标为本地 bundle 版本，Compose 使用 `pull_policy: never`。原生运行时必须包含对应平台的 Caddy、Node、CONNECT、Forgejo、InfluxDB 及所需 CLI/动态库。

## 4. 安装状态

稳定目录逻辑如下；平台物理路径由安装器映射：

| 状态 | 逻辑路径 | 升级行为 |
| --- | --- | --- |
| 不可变程序 | `releases/<version>/` | 新建，不覆盖 |
| 当前指针 | `current` | 就绪后原子切换 |
| 配置 | `config/` | 版本化迁移，先备份 |
| Secret | `secrets/` | 永不进入发布或日志 |
| 证书/CA | `pki/` | 保留、备份、显式轮换 |
| 许可证 | `license/` | 保留，WEB 同源加载 |
| Git | `data/forgejo/` | 保留 |
| 历史 | `data/influxdb/` | 保留 |
| CONNECT | `data/connect/` | 保留 |
| 备份 | `backups/` | 只追加，显式清理 |

Linux 默认根为 `/opt/xyvirtual-appliance`、`/etc/xyvirtual-appliance` 和 `/var/lib/xyvirtual-appliance`；Windows 默认根为 `%ProgramFiles%\XYvirtual Appliance` 和 `%ProgramData%\XYvirtual Appliance`。

## 5. 生命周期命令

- `preflight`：只读；一次报告全部错误，非零退出表示不可安装。
- `install`：幂等；相同版本/配置重复运行不重置 Secret 或数据。
- `upgrade`：验证候选和 origin、备份配置；数据服务版本变化时创建一致性全备份；短暂停机启动候选，等待控制面与真实 HTTPS 就绪后提交指针并保留上一版本；失败时先恢复数据再重启旧版。
- `rollback`：只切回已验证的上一发布，不降级或删除共享数据；若 Schema 不兼容则拒绝并说明恢复步骤。
- `backup`：停止写服务后复制配置、PKI、许可证、Secret、Git、历史和 CONNECT 数据，生成逐文件摘要后恢复服务。
- `restore`：只接受本安装 `backups/` 下、origin/target/installId 一致且摘要完整的备份；需要显式 installId 确认。
- `uninstall`：默认保留持久状态；`--purge-data` 需要附加 `--confirm-purge <installId>`。

脚本不得自动安装/删除容器运行时、WSL、Hyper-V、CA 根或防火墙产品；需要管理员权限时必须在改动前说明。

## 6. HTTPS 与路由

标准路由：

| Route | Owner |
| --- | --- |
| `/` | WEB 静态发布 |
| `/health/live`、`/health/ready` | 控制面 |
| `/appliance/`、`/appliance/api/status` | 控制面 |
| `/diagnostics/` | 浏览器环境诊断 |
| `/connect/`、CONNECT WebSocket route | CONNECT 同源代理 |
| `/git/` | Forgejo |
| `/api/v2/`、`/influx/health` | InfluxDB API |

InfluxDB UI 可以使用独立 `influx.<host>`，其证书必须由同一信任链覆盖。Caddy 配置必须保留 WEB 构建 CSP，并补充不能由 meta CSP 表达的安全响应头。认证需覆盖 REST 和 WebSocket，不得只保护 HTML。

为兼容 WEB 已发布的 CONNECT origin 契约，入口给主文档设置非敏感 `rv_connect_origin=1` cookie，并把 CONNECT 的稳定根路径（包括 `/health`、`/ws`、`/webviewer`、`/config*`、`/signals*`、`/history*`、`/diagnose*` 等）原样代理到 CONNECT；`/health/live` 与 `/health/ready` 仍只属于控制面。`/connect/*` 是显式别名并去掉该前缀。新增 CONNECT API 时必须同步此 allowlist 和契约测试，不能用“所有未知路径都代理”吞掉 WEB 资源或控制面路径。

## 7. 健康契约

`/health/live`：HTTP 200，JSON `{ "status": "ok", "service": "appliance-control" }`。

`/health/ready`：所有核心服务和当前发布校验成功时 200，否则 503。响应包含稳定服务 ID、`ok|degraded|failed`、错误码和毫秒耗时；不包含 URL 中的凭证、token、证书私钥路径或客户数据。外部 PLC/工业端点单列为 `dependencies`，默认不决定入口 readiness。

## 8. 浏览器诊断契约

诊断至少输出：时间、origin、浏览器标识、`isSecureContext`、WebGL1/2 上下文与限制、WebGPU adapter/features/limits、WebXR VR/AR support、File System Access、OPFS 实际往返、storage persisted/estimate、service worker 状态、健康/WSS 结果。每项包含 `required|feature|advisory`、`pass|warn|fail|unsupported` 和稳定 code。

证书链/SAN/到期由主机预检验证；浏览器脚本本身只能证明当前页面是否被当作 secure context。诊断页可以把该结果与控制面返回的主机侧脱敏证书证据（模式、有效期、SAN 结果、SHA-256 指纹）合并，但不得伪称这些字段由浏览器 TLS API 直接读取。
