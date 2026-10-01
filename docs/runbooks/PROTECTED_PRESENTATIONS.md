---
doc_id: RUNBOOK-ACCESS-001
title: 受保护演示部署与使用 / Protected presentations
status: approved
owner: engineering
last_reviewed: 2026-10-01
authority: normative-process
---

# 受保护演示 / Protected presentations

规范依据：[产品规格](../product-specs/PROTECTED_PRESENTATIONS.md)、[API 契约](../contracts/PROTECTED_PRESENTATIONS.md) 与 [ADR-0012](../adr/ADR-0012-protected-presentations.md)。

## 安装和账户

完整 `npm run build` 会生成 `dist/present`；Appliance 构建器拒绝缺少该入口的 WEB 产物。Caddy 唯一入口开放 `/present/` 和 `/api/access/v1`；模型在 `state/data/access/blobs`，不能复制到 `web`、CDN 或其它静态目录。安装器生成 access 的同源 HTTPS origin，并在容器中只给控制面挂载该数据目录。

没有默认业务密码和匿名注册。首次由本机运维使用随包 Node 和 `runtime/access/admin.mjs` 创建展示管理员。CLI 唯一参数是 access 数据目录；标准输入为 JSON `{ "action": "create", "username": "<账户>", "password": "<至少12字符>", "role": "admin" }`。用受限文件/安全标准输入提供该 JSON，不将密码放入命令行、环境变量、脚本仓库或终端历史。执行者须使用控制面服务账户，避免产生服务无法读取的 root 所有文件。

原生 Linux 使用 `xyvirtual` 服务账户执行随包 `runtime/node/bin/node runtime/access/admin.mjs <state/data/access>`；Windows 使用控制面服务身份及对应随包 `node.exe`，由 IT 保护数据目录 ACL。容器模式使用 `docker compose --env-file <compose.env> -f <compose.yaml> exec -T control node /app/access/admin.mjs /state-access`，仍通过安全 stdin 输入，默认容器用户为 node。命令成功只打印状态，不打印密码。

恢复管理员密码使用同一 CLI，将 action 改成 `reset`；该账户全部旧会话失效。展示管理员与 Caddy operator 独立，不能向访客分发 operator 密码。

## 发布、分享和撤销

1. 打开同源 `/present/`，登录展示管理员。中英文可即时切换。
2. 从工作台导出自包含 GLB，在“发布演示”中填写名称并选择文件。系统验证结构、外部依赖、脚本、大小和总配额；失败不会发布半成品。GLB 内原有 ID 不重写。
3. 如需确定账户身份，先创建访客账户，再在创建分享时指定该账户；否则选择持链接访问。选择一天、七天、三十天或最多九十天内的自定义期限。
4. 复制一次性显示的完整链接；后端只存 token 摘要，不能重新显示遗失的原链接。可撤销后新建。发出链接是用户自己的操作，产品不会自动发送邮件或外呼。
5. 访客打开后 URL 中的 fragment 凭据被清除；服务器 Cookie 限定一个演示。页面支持旋转、缩放、现有 embed 仿真和带水印截图，不加载完整工作台或工业接口。
6. 管理员点击撤销，列表显示最终状态。后续资源读取立即被拒绝，正常前台最多十五秒内检查并清除显示；恢复前台时立即检查。网络错误时同样清除显示。
7. 访问记录区显示账户/访客编号、时间、动作、对象和结果。`resource.read delivered` 表示服务器提供数据，不证明访客认真查看，也不证明真实自然人身份。持链接访客无法按姓名确证。

写入超时后先刷新列表查最终状态；不盲目重复发布或创建链接。API 发布支持 Idempotency-Key；复用相同 ID 和字节返回同一结果，改变字节返回冲突。当前 UI 超时会提示刷新核对。

## 运维、升级和恢复

控制配置 `access` 拥有 root/origin/maxBytes/quotaBytes/retentionDays，不能来自项目、GLB 或 URL。默认单文件 128 MiB、总模型 2 GiB、审计九十天。账户密码使用 scrypt，会话/分享 token 只存摘要。Cookie 不落 localStorage。客户端保留语言偏好不构成授权。

备份需沿用 Appliance 停服务一致性备份，覆盖 data/access。直接复制正在写入的 SQLite 不作为支持的备份流程。数据库版本高于当前支持版本时启动失败，不自动重建。回滚不能跨越不支持 protectedPresentations 数据格式的旧版本；恢复备份后所有恢复的链接和会话失效，管理员须重新创建链接。

旧 LoginGatePlugin 的 userB64/passB64 配置现在显示明确迁移错误，不再认证。移除这两个字段，创建服务器账户，并使用受保护发布流程；仅换登录界面不能保护仍在公开静态目录中的旧模型。既有 AES 加密模型和外部 share API 不变。

使用 LoginGatePlugin 集成时，插件移除、Viewer 销毁或门禁替换会以 `AbortError` 拒绝尚未放行的 `loadGate`，等待中的 `loadModel()` 随之取消，不继续解析模型。调用方应处理加载 Promise 的取消；已销毁的插件不能再次安装，替换门禁前发出的认证响应不能放行新门禁。

## 验收入口与证据

| 行为 | 自动化入口 |
| --- | --- |
| Cookie/伪造身份、Origin/CSRF、跨资源、Range/HEAD | `tests/access-control.node.test.ts` |
| 到期/撤销、禁用/重置密码/退出、慢请求期间退出、最后管理员保护 | 同上 |
| 发布幂等性、脚本/外部依赖拒绝、配额/大小、限速、损坏存储和审计保留 | 同上 |
| 停机备份恢复后链接失效、禁止不兼容旧版直接回滚 | `tests/appliance-lifecycle.node.test.ts`、`tests/appliance-compatibility.node.test.ts` |
| 登录门禁移除/销毁取消真实模型加载、重复安装、迟到认证响应及授权正反例 | `tests/login-gate-lifecycle.test.tsx` |
| 真 HTTPS 发布、指定账户、同标签页切换、刷新恢复、水印截图、撤销和断网清场、运维接口隔离 | `node scripts/test-protected-presentations.mjs`（先运行完整构建，需 Docker 和 Playwright Chromium） |

HTTPS 场景使用真实 Caddy 模板、生产前端产物和真实 Node/SQLite，只创建合成模型及临时账户，容器仅监听本机。证据位于忽略提交的 `test-results/access`；CI Browser Gate 上传对应 artifact，管理截图遮盖分享凭据。完整交付还要求 governance/static/node/browser/build 门禁。Linux 上的自动化不替代 Windows 安装、客户真实大模型、移动浏览器或生产网络的验收。

## English operating guide

Build the full WEB payload, including `dist/present`, and install it behind the supplied Caddy configuration. Keep all confidential model bytes under the private `data/access` directory. The access session does not authorize CONNECT, MCP, Forgejo, InfluxDB or appliance administration.

Bootstrap a presentation administrator locally with the bundled Node executable and `runtime/access/admin.mjs <access-data-directory>`, running as the control service identity. Supply a JSON object containing action (`create` or `reset`), username, password (at least twelve characters), and role (`admin` for bootstrap) through protected standard input. Never pass passwords as command arguments or commit them. Container installations can execute `/app/access/admin.mjs /state-access` inside the control container. Reset invalidates that account's previous sessions.

Sign in at `/present/`, upload an exported self-contained GLB, create a link with an expiry, and choose either a designated local account or anyone holding the link. External dependencies and executable scripts are rejected during publication. Copy the link when it is created; its secret cannot be recovered from the database. Revoke a lost link and create a new one.

Revocation blocks subsequent requests, including existing visitor sessions. The normal foreground viewer checks every fifteen seconds and whenever it becomes visible. Failure to verify access clears the presentation. Already downloaded bytes cannot be recalled; a watermark is attribution, not DRM. Screenshots made with the page's screenshot button include the watermark. Offline exported files cannot receive remote revocations.

Use appliance consistency backups with services stopped. A restore invalidates every recovered share and session, so recipients need newly created links. An older release that cannot read the access format cannot be used for direct rollback. Logs contain stable account/visitor IDs and outcomes, not raw credentials or IP addresses. After an uncertain write result, refresh and inspect server state before retrying.
