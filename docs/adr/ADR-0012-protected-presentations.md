---
doc_id: ADR-0012
title: Appliance 内的演示访问控制边界
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-09-29
authority: normative
---

# ADR-0012：Appliance 内的演示访问控制边界

## Context

旧 LoginGatePlugin 在浏览器解码凭据，并通过 localStorage 标记放行。现有 Appliance Caddy Basic Auth 已保护运维入口，但没有演示级授权。外部分享后端契约已有客户端和 Stub，不能视作客户内网实现。用户于 2026-09-29 批准 L2-1 方案。

## Decision

1. 复用 Node 控制面，通过独立 access 模块注册 API；Caddy 仅匿名开放专用演示入口、专用编译资源和 access API。其它入口继续要求 operator 认证。access 会话永远不赋予工业或运维权限。
2. 状态由客户服务器持久目录 data/access 拥有：SQLite 保存版本化账户、会话、演示索引、分享和审计；GLB 存于其 blobs 子目录，永不挂载到静态 WEB 根。使用 Node 内置 crypto/scrypt 与 SQLite，避免增加在线依赖。
3. 访客入口复用 RVEmbedViewer 的公开引擎与固定时间步。它不加载 main.ts、工作台、外部插件或工业接口。首版只接受自包含 GLB，外置 URI/脚本发布失败。模型本身的 ID、元数据格式不重写。
4. 服务器使用随机 token 摘要与数据库状态授权；Cookie 受 HTTPS、HttpOnly、SameSite 保护。写操作同时校验部署 origin 和 CSRF。密码异步 scrypt，限速且限制并发，数据库不存可逆凭据。
5. 服务器每次重新检查分享、账户与期限；资源 no-store，不下发可复用公开下载地址。撤销、审计和会话失效使用事务。未知版本/数据库错误失败关闭。
6. 备份沿用停止服务后一致性复制；恢复后撤销全部恢复的分享与会话。旧版本不理解 access 格式时禁止直接回滚，不能把故障转为公开读取。
7. 这是 OD-001 的私有化演示子决策，不关闭组织、租户或云端项目后端的剩余规格闸口。

## Alternatives

仅换登录界面不能保护字节；只用 Basic Auth 无法限定演示和撤销单个链接；外部 Firebase 不符合离线交付；直接将完整工作台匿名开放扩大安全边界，均不采用。

## Consequences

增加 SQLite 状态、账户运维和恢复失效语义。新 API 与旧分享后端契约分开版本化，旧加密模型能力保留。访问控制不承诺 DRM，也不依赖离线 License 的合同凭证逻辑。

## Compatibility and Migration

旧静态构建继续存在；旧 userB64/passB64 登录配置明确报迁移错误而不认证。现有外部分享 API 不变。新数据格式在发布兼容声明登记，Node SQLite 仅由 Appliance 使用，不改变浏览器技术栈。

## Validation

服务端事务/HTTP 测试、真实 Caddy 路由测试、浏览器发布到撤销闭环、公共构建、安装配置和恢复测试、全仓门禁。

## Rollback or Supersession

回退代码保留敏感文件及撤销状态；不能读取新格式的旧发行版不允许直接回滚。恢复备份使所有分享失效，管理员必须重新创建链接。后续替代必须保留逐请求授权和不可公开访问的存储边界。
