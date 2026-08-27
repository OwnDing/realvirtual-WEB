---
doc_id: CONTRACT-DEPLOYMENT-CONFIG-001
title: Deployment Config v1 契约
status: approved
owner: architecture
last_reviewed: 2026-08-27
authority: normative
---

# Deployment Config v1 契约

机器可读 Schema 为 [`../../schema/v1/deployment-config.json`](../../schema/v1/deployment-config.json)。运行时输入是同源 `settings.json` 中的 JSON object。

## 1. 新增顶层字段

- `schemaVersion`: 当前唯一支持值为 `1`；缺失表示兼容旧配置。
- `identity`: 产品名、短名、说明、Logo、favicon 和主题色。资源 URL 必须为同源相对 URL。
- `legal`: 对应源码、许可证、隐私与条款链接；是否必需由部署许可证配置决定。
- `egress`: `deny-external` 或 `allow-listed`，以及逐项 `origin + purposes[]`。
- `services`: Analytics、新闻、文档、CONNECT 发布信息、Firebase Demo、GitHub 与 CAD 链接。`null` 或缺失为关闭。
- `license`: 签名许可证文件的期望。`required` 缺省 `false`；`path` 缺省 `license.rvlic`，按 `relativeAssetUrl` 校验以锁死同源；`installId` 为自述安装标识。完整语义见 [`LICENSE_FILE.md`](LICENSE_FILE.md) §8。

## 2. Purpose

稳定用途为：`analytics`、`news`、`documentation`、`legal-link`、`connect-updates`、`firebase-demo`、`github-library`、`cad-link`、`remote-model`、`industrial-interface`、`multiuser`、`share`、`debug-tool`。

Purpose 是授权键，不是展示文本，不得本地化。

## 3. 解析与失败

未知旧字段保留。新字段逐项验证；未知 Schema 版本、非法 origin、非法 purpose、远程 identity 资源或错误类型被丢弃并产生诊断。任何错误都不能把策略从拒绝变成允许。

Origin 必须是绝对 `http:`/`https:`/`ws:`/`wss:` origin，不包含路径、查询、fragment、userinfo。匹配时 HTTP(S) 与 WS(S) 是不同 origin。

`license` 段同样逐项验证：`required` 只有布尔 `true` 才启用，其它一切值（含字符串 `"true"`）为 `false`；非同源 `path` 回落到默认值并产生诊断；非法 `installId` 被忽略并产生诊断。未支持的 `schemaVersion` 会连同其它部署字段一并丢弃 `license`，结果是授权子系统不启用——与安全字段「失败即拒绝」方向一致：不启用不会把任何东西判成已授权。

解析必须幂等：部署配置在每次启动被校验两次（`rv-app-config.ts` 的 `fetchAppConfig` 与 `setAppConfig`），把本函数的输出再喂给它一次必须得到相同结果且不产生新诊断。

## 4. 优先级

内置安全默认值建立 `deny-external`；部署配置只能通过有效 allowlist 开放。项目、模型、用户、会话与 URL 参数不能修改本契约字段。组织平台可以生成最终 `settings.json`，但浏览器只消费一个部署快照。

## 5. 兼容

本契约不重命名现有字段、GLB/rv-ODT、`rv_extras`、NodeId、项目文档、资产引用、插件 ID 或存储 key。旧客户端忽略新增字段；新客户端在旧配置下使用安全默认值。
