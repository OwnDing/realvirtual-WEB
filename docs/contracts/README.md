---
doc_id: CONTRACT-INDEX
title: 契约文档索引
status: approved
owner: architecture
last_reviewed: 2026-08-27
authority: normative-registry
---

# 契约文档索引

当前正式版本化契约主要位于：

- [`../../schema/v1/rv-odt.json`](../../schema/v1/rv-odt.json)
- [`../../schema/v1/specification.md`](../../schema/v1/specification.md)
- [`../../schema/v1/conformance/README.md`](../../schema/v1/conformance/README.md)
- [`ASSEMBLY_PORTS.md`](ASSEMBLY_PORTS.md)：稳定装配端口身份、方向、兼容与旧 Snap 迁移契约。
- [`DES_RUNTIME.md`](DES_RUNTIME.md)：公开 DES 的状态所有权、时间/排序、MU/预约、故障、快照 v3、实验与行业边界。
- [`DEPLOYMENT_CONFIG.md`](DEPLOYMENT_CONFIG.md)：Deployment Config v1；部署身份、法律链接、服务和默认拒绝的 origin/purpose 外呼策略。
- [`UNIFIED_CONFIGURATION.md`](UNIFIED_CONFIGURATION.md)：Deployment Config v2 与 Project Config v1；四层普通值、部署策略上限、来源解释和兼容迁移。
- [`LICENSE_FILE.md`](LICENSE_FILE.md)：许可证文件 v1；信封与载荷、`RV-LIC-V1` 域分隔签名、同源失败关闭加载、判定顺序与到期状态行为。
- [`OFFLINE_APPLIANCE_BUNDLE.md`](OFFLINE_APPLIANCE_BUNDLE.md)：Offline Appliance Bundle v1；目标平台归档、依赖锁、安装状态、HTTPS 路由、健康和浏览器诊断契约。

后续契约应逐步覆盖：项目清单、配置层级、插件 API、信号/接口、事件、持久化和迁移。契约变化遵循 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md)。
