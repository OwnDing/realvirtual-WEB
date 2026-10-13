---
doc_id: ADR-0016
title: 部署白标统一解析与交付投影
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-10-13
authority: normative
---

# 部署白标统一解析与交付投影

## Context

2026-10-12 用户批准实施方案。Deployment v2 已存在；identity 引用 v1 封闭 Schema。首屏、MUI、PWA、SEO、受保护页面与导出分散，旧 branding-store 的项目覆盖与 ADR-0008 部署权威漂移。

## Decision

保留 identity 与 v1 契约，Deployment v2 增加可选 branding（独立 schemaVersion=1）。Node 与浏览器共用纯解析器；品牌只属于部署。旧项目 API 保留附加标题字段，对身份覆盖诊断并忽略。

交付阶段从同一配置投影 HTML、manifest、公开品牌快照和内容寻址资源，生成完整输出目录后由交付者原子切换。HTML 首屏直接包含品牌；运行时使用同源配置。受保护入口只嵌入白名单品牌数据与复制的品牌资源，不开放 settings.json。

单 HTML 导出嵌入经校验的品牌文字、主题和图片数据，不携带部署策略、账户、工业连接或 URL。原演示载荷和配方格式保持不变。法律告知独立。

## Alternatives

不采用客户源码 fork、启动后才换 Logo、任意 CSS 注入或复制完整部署配置到公开登录页。

## Consequences

品牌更新需要重新生成并整体替换交付产物；应用 JS 可复用。增加资源校验、缓存版本与浏览器验收。外部页面只获得公开品牌投影。

## Compatibility and Migration

缺少 branding 保持默认；v1/legacy 中同名扩展不激活，迁移到 v2 时丢弃该保留段；未知 branding 版本回退。未知普通扩展字段保持。GLB/rv_extras、稳定 ID、用户存储与项目格式不变。

## Validation

共享解析幂等、注入和路径反例、部署层覆盖限制、默认/两套品牌、子目录/离线、HTML/manifest/资源一致性、导出断网、现有访问边界和适用完整门禁。

## Rollback or Supersession

恢复上一完整交付目录及配置/品牌资源；不转换或删除项目数据。旧客户端忽略新增 branding，视觉可能回退而数据保持可读。
