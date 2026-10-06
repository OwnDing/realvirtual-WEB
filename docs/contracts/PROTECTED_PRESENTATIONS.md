---
doc_id: CONTRACT-ACCESS-001
title: Protected Presentations API v1
status: approved
owner: architecture
last_reviewed: 2026-09-29
authority: normative
---

# Protected Presentations API v1

API 根为 `/api/access/v1`；同源 HTTPS，错误为 `{error:{code}}`，所有响应 no-store。公开业务请求由模块独立鉴权，不能相信客户端身份头。写请求必须匹配部署 Origin，登录/兑换外的写请求还须提供会话关联的 `X-CSRF-Token`。未知路径默认 404，未知方法 405。

| 路径 | 方法 | 权限与用途 |
| --- | --- | --- |
| `/login` | POST | username/password；随机会话 Cookie，统一 401；限速 |
| `/session` | GET | 返回当前账户、CSRF、有效期与可查看分享；无效 401 |
| `/logout` | POST | 删除当前会话，清除 Cookie |
| `/users` | GET/POST | 管理员查询、创建本地访客/管理员 |
| `/users/:id` | PATCH | 管理员禁用/启用、重置密码；相关会话失效 |
| `/presentations` | GET/POST | 管理员列表/上传自包含 GLB，POST 使用 Idempotency-Key |
| `/shares` | GET/POST | 管理员创建和查询链接；presentationId、expiresAt、可选 userId |
| `/shares/:id/revoke` | POST | 管理员幂等撤销，响应最终状态 |
| `/redeem` | POST | 分享 ID 与原始 token；指定账户分享还需对应账户会话 |
| `/shares/:id` | GET | 已兑换会话；元数据、水印身份、服务器时间 |
| `/shares/:id/model` | GET/HEAD | 已兑换会话；逐请求授权，仅该快照。支持单段 bytes Range |
| `/audit` | GET | 管理员分页读取脱敏审计 |

分享 URL 为 `/present/#share=<id>&token=<token>`；fragment 在页面启动时立即移除，兑换时 POST 发送。会话 token 与 CSRF 不写浏览器持久存储。指定账户登录后可以继续兑换内存中的分享 token；刷新已兑换页面通过会话恢复。

## 存储与限制

access SQLite `user_version=1`；模型存储名由服务器生成，客户端文件名仅作展示。单 GLB 默认上限 128 MiB，总模型配额默认 2 GiB；禁止外置 URI 与可执行脚本，上传完整校验后才发布。JSON 请求 16 KiB 上限。分享最多九十天，账户会话八小时，访客会话最多八小时且不超过分享期限。随机 token 为 32 字节，数据库只保存 SHA-256 摘要。持链接访客编号不是自然人身份。

单控制面同时最多一个上传、四个密码派生任务及四个模型响应；模型下载槽位保持至响应结束或连接关闭，慢客户端不能绕过内存并发上限。超过上限返回 429，调用方不得自动重试写操作。

## 失败与恢复

401 无有效会话、403 权限/CSRF不足、404 无可见资源、410 已撤销/到期、413 超限、422 发布依赖无效、429 限速、503 存储/服务不可用。服务器决定有效期；撤销事务提交后的新请求不得成功。已在传输或已下载字节不承诺收回。发布失败不暴露半成品；同一操作 ID 返回同一发布结果。恢复后清除会话并撤销恢复的所有分享，不复活备份时间点仍有效的链接。
