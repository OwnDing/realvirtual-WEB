# XYvirtual Offline Appliance 现场验收清单

本清单是 [安装手册](INSTALL.zh-CN.md) 第 6 节的展开，用于在客户现场或客户等价环境中，为一个具体归档留下可复核的验收证据。英文摘要见 [FIELD_ACCEPTANCE.en.md](FIELD_ACCEPTANCE.en.md)；填写模板见 [`../acceptance/FIELD_ACCEPTANCE_RECORD.template.md`](../acceptance/FIELD_ACCEPTANCE_RECORD.template.md)。

## 0. 边界

- 自动化门禁（CI、进程内 OPC UA 测试服务器、模拟的 Unity）不等于现场验收。本清单的每一项都必须在真实主机、真实网络和真实浏览器上执行。
- **本清单不授权任何 PLC 写入。** F8–F10、F12 中的写入、点动和强制，只能在现场负责人书面授权、确认联锁与急停之后，对专门的测试信号执行。
- 自动探针 `acceptance/probe.mjs` 只读：它登录给定的账户、读取这些账户可读的内容并登出，从不写信号、点动驱动或发送多人写类消息。证据文件里不含口令、Cookie 或 CSRF 令牌。
- 任一项不通过时记录现象与原始输出，不要改配置“让它通过”后只记最后一次结果。

## 1. 验收范围

按实际交付的组合逐一执行（至少覆盖客户要部署的组合）：

| 目标 | container | native |
| --- | --- | --- |
| `linux-x64` | ☐ | ☐ |
| `linux-arm64` | ☐ | ☐ |
| `windows-x64` | ☐ | ☐ |

CONNECT 是可选组件（ADR-0023）。发布包不含 CONNECT 时，相关项记为“不适用”。

## 2. 准备

- 一台目标主机，满足 [支持矩阵](SUPPORT_MATRIX.zh-CN.md)；稳定主机名与 Influx 主机名均已解析；客户 CA 或已批准的 internal CA 分发流程。
- 四个测试账户：查看者、操作员、工程师、管理员（安装后在 `/present/` 创建）。把它们写进一个**放在归档外、验收后删除**的 `accounts.json`：

  ```json
  { "viewer": { "username": "acc-viewer", "password": "…" },
    "operator": { "username": "acc-operator", "password": "…" },
    "engineer": { "username": "acc-engineer", "password": "…" },
    "admin": { "username": "acc-admin", "password": "…" } }
  ```

- 一个 OPC UA 测试端点：PLC 测试工程或 PLC 仿真器，至少包含一个可写的 `PLCInput*` 测试信号和一个 `PLCOutput*` 信号。不要使用生产信号。
- 如需验收多人协作：一台运行 Unity MultiplayerWEB（7000 端口）的主机，以及现场防火墙的修改权限。
- 一台与操作员相同网络、策略和浏览器的工作站；能够阻断 Appliance 外呼的网络或主机 ACL。
- 一个证据目录，例如 `evidence/<主机名>-<日期>/`。

## 3. 验收项

| ID | 操作 | 通过标准 | 证据 |
| --- | --- | --- | --- |
| F1 | 取得归档，记录文件名、版本、目标，计算 SHA-256 | 与交付记录一致 | 文件名、`sha256sum` 输出 |
| F2 | 运行目标包自己的 `preflight` | 退出 0，无阻断项 | 完整输出 |
| F3 | 按安装手册第 4 节安装（container 或 native） | 退出 0；服务全部运行 | 安装输出、服务列表 |
| F4 | 分发并信任 CA 根证书，带外核对指纹 | 浏览器无证书警告；HTTP 跳转 HTTPS | CA 指纹、截图 |
| F5 | 在工作站运行自动探针（见第 4 节） | 证据 JSON 中 `failed` 为 0；未提供的角色记为 skipped | `appliance-acceptance-*.json` |
| F6 | 每类操作终端打开 `/diagnostics/` | HTTPS、WebGL2、OPFS、Appliance 通过；按工位检查 File System Access、WebGPU、WebXR | 截图或导出 |
| F7 | 按网关契约填写 `config/gateway.json` 的 `source` 与 `signals`，重启网关 | `/gateway/health` 源为已连接；HMI 显示实时值；趋势面板有历史 | 健康 JSON、截图 |
| F8 | **授权后**：操作员写测试 `PLCInput*` 信号；查看者打开同一界面 | PLC 值变化；`writes.jsonl` 有一条带用户与角色的 `written`；查看者看不到可用的写控件 | 审计行、截图 |
| F9 | **授权后**：工程师强制设置并解除测试信号 | 访问审计中有设置与解除两条，带用户 | 审计导出 |
| F10 | 触发一个测试告警；操作员确认，工程师搁置；查看者尝试确认 | 确认/搁置进入审计；查看者无法确认 | 截图、审计 |
| F11 | 工程师保存服务端项目；查看者打开 | Forgejo 中出现以该用户为作者的提交；查看者只读 | 提交记录 |
| F12 | 多人协作（若交付）：在 `gateway.json` 配置 `multiuser.upstream`；把 Unity 7000 端口限制为仅 Appliance 可达；运行 `probe.mjs --multiuser`；查看者与操作员各开一个浏览器加入；**授权后**由操作员点动测试驱动 | 工作站直连 `ws://<unity>:7000` 失败；探针 M 项通过；查看者以观察者加入且无写控件；点动在 Unity 中生效；`writes.jsonl` 有 `multiuser:drive_jog:…` 的 `unknown` 记录，带操作员身份 | 防火墙规则、探针证据、审计行 |
| F13 | 在外呼被阻断的状态下重启 Appliance 并重复 F5–F7 | 功能不变；防火墙日志中没有 Appliance 发起的外部连接 | 防火墙日志 |
| F14 | 按安装手册第 7 节：备份 → 升级到候选版本 → 回滚（或按提示用备份恢复）→ 恢复 | 每一步退出 0；账户、项目、历史、网关配置在每一步后都还在 | 每一步输出、F5 重跑结果 |
| F15 | （测试主机）默认卸载，再重新安装 | 卸载后状态保留；重装后数据可用 | 输出 |

## 4. 自动探针

在工作站上（需要 Node 22 或更高；也可用归档内 `runtime/` 的 Node）：

```bash
node acceptance/probe.mjs --url https://xyvirtual-a01.plant.example \
  --ca /path/to/root.crt --accounts /secure/accounts.json --multiuser \
  --out evidence/xyvirtual-a01-2026-11-03/probe.json
```

- `--ca` 必填：客户 CA 或 internal CA 根证书；证书链不受信任时探针以退出码 2 停止，不会跳过校验。
- 不交付多人协作时去掉 `--multiuser`。
- 探针检查：健康端点；未登录访问被送去登录页、网关拒绝无会话请求、运维面要求共享凭据；安全响应头；每个角色能登录、会话角色正确、能进入 HMI 与网关、只有管理员能列出账户；网关自报信息；多人守卫把自称操作员的查看者降为观察者、保留操作员。
- 结束后删除 `accounts.json`。证据文件权限为 0600。

## 5. 签收

| 角色 | 姓名 | 日期 | 结论 |
| --- | --- | --- | --- |
| 客户 IT | | | |
| 客户 OT / 现场负责人 | | | |
| 交付方 | | | |

完成后把填好的记录、证据目录清单和每项结论交给维护者，由维护者登记到 EP-APPLIANCE-001 与验收矩阵。未执行的项写“未执行”和原因，不写“通过”。
