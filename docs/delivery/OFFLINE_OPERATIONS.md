---
doc_id: DELIVERY-OFFLINE-001
title: WEB 离线构建、配置和门禁
status: approved
owner: engineering
last_reviewed: 2026-09-09
authority: normative-process
---

# WEB 离线构建、配置和门禁

适用范围为 [PS-OFFLINE-001](../product-specs/OFFLINE_RUNTIME.md)。应用通过一个本地或内网 HTTP(S) 源提供页面、模型、字体、解码器和文档；浏览器运行不依赖外网。依赖安装、下载 Git LFS 和编译环境准备不属于运行时离线承诺。

## 构建与交付

依赖和本地资产齐备后运行 `npm run build:offline`，也可使用 `RV_DEPLOYMENT_PROFILE=offline npm run build`。预设仅改写生成的 `dist/settings.json` 和 CSP，不修改源配置或用户项目。它强制 `egress.mode` 为 `deny-external`、清空白名单、关闭外部服务，并优先于 GA 环境变量；QR 使用本地生成器。

完整交付 `dist/`，包括 `draco/`、字体、模型、Worker 和 `deployment-headers.json`。静态服务器必须将该 JSON 中的响应头应用到 HTML **以及 Worker JavaScript**，不能只把 JSON 文件放在目录中；HTML 内的 CSP 无法单独约束所有独立 Worker。关闭 DNS 预取，缓存策略应确保更新后的配置和 HTML 同时生效。文件 MIME 类型须正确，尤其 `.wasm` 为 `application/wasm`。

本任务没有改变用户现有宿主服务器或发布设置。上线前在目标宿主复验 CSP 响应头；同源后端自身的外呼须由其服务配置和网络控制另行约束。

## 已部署站点的启动开关

在同源 `settings.json` 中使用：

```json
{
  "schemaVersion": 2,
  "egress": { "mode": "deny-external", "allow": [] },
  "services": {
    "analytics": null,
    "news": null,
    "documentation": null,
    "connectUpdates": null,
    "firebaseDemo": null,
    "githubLibrary": null,
    "cadLinks": null,
    "qr": { "mode": "local" }
  }
}
```

将这些字段合并进现有部署配置，保留身份、许可证和项目默认值，然后**重新加载页面**。启动策略会与构建 CSP 取交集，不能放宽已交付的限制。缺失、损坏、未知版本配置默认拒绝外部访问。此开关不在运行中热切断已建立的连接。

同源 HTTP(S)/WS(S) 与本地 blob/data 资源可用；跨源 localhost 和局域网也视作外部源。在线工业连接需要准确的 origin（包括端口、协议）及 `industrial-interface` 用途。Teams 需要在线 `multiuser` 授权，包括 SDK 配置来源 `https://res.cdn.office.net`。扩大授权时须同步重新生成完整 CSP/响应头，不能只修改 JSON。受控 HTTP 请求拒绝自动重定向；将配置指向最终资源 URL。Loader 子资源由 URL 判定与宿主 CSP 共同约束。

## CI 和本地验收

`./scripts/verify.sh offline` 是完整入口：重新构建离线生产包，在仅有 loopback 的 Linux 网络命名空间中运行 Chromium。环境需已有 Node、依赖、Playwright Chromium、`unshare`、`ip`。若有无交互 sudo 能力，优先创建独立网络命名空间、启用 loopback，再通过 `setpriv` 恢复调用者的 UID、GID、附加组和 HOME，清除 capabilities 并禁止新增权限后运行 Node/Chromium；报告同时验证身份与网络隔离。无 sudo 时使用非特权用户命名空间；若宿主策略阻止 Chromium 读取其 GLES 库，前置检查会明确失败，须在具备上述能力的 Linux runner 上验证，不修改宿主安全策略或防火墙。

已有 required **Browser Gate** 构建离线包并在浏览器单元测试前运行 `node scripts/run-offline-gate.mjs`；该直接命令要求 `dist/` 已由当前源码构建。门禁首先验证真实 WebGL2 像素读回，报告包含浏览器版本、图形后端、进程身份和失败诊断；浏览器启动或清理失败仍保留报告。`verify.sh all` 保留原有跨平台范围，Linux 离线验收另外运行 `offline`。

门禁验证真实 GLB、工作区、本地保存重开、Draco Wasm、异常及残留在线配置、被拒绝的模型和重定向。检测器覆盖整个浏览器上下文的请求、弹窗、帧、WebSocket、Worker 和 CSP 拒绝，并用故意外呼的 canary 证明检测器会失败。OS 网络探针必须得到 `ENETUNREACH`。报告位于 `test-results/offline/report.json`，失败旅程保留 Playwright trace，CI 上传该目录。

`verify.sh static` 同时运行已知域名检查和原生网络入口 AST 检查。新增直接 `fetch`、Socket、Worker、动态 import 等需接入受控 I/O 或在 `scripts/network-boundary-review.json` 中逐项审计准确表达式；不得批量重建例外来消除失败。静态检查有明确的语法覆盖范围，不能代替生产旅程和宿主网络限制。

## 边界与回退

尚不覆盖 `file://` 冷启动、PWA 安装、独立 embed 宿主页、浏览器自身更新、真实 PLC、Windows 气隙安装和服务器外呼。应用层策略约束自有入口，无法替代宿主对恶意同源代码、导航重定向或服务端代理的控制。

回退整个部署目录及本任务代码即可，不迁移或删除项目数据。恢复在线功能使用有效白名单与匹配的 CSP，保留安全测试。
