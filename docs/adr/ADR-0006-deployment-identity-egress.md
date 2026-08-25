---
doc_id: ADR-0006
title: 部署身份与外呼策略作为部署权威状态
status: approved
owner: architecture
last_reviewed: 2026-08-25
authority: normative
adr_status: accepted
---

# ADR-0006：部署身份与外呼策略作为部署权威状态

## Context

品牌、服务地址和外部资源目前分散在 HTML、i18n、HMI、Library、Demo 与部署脚本中。`RVAppConfig` 只进行顶层对象检查，TypeScript 类型不能验证运行时 JSON。单独包装 `fetch` 也无法覆盖脚本、图片、Three.js Loader、WebSocket 和外部导航。

仓库宪法已经规定品牌、默认模型与网关属于部署配置；`OD-003` 尚未决定完整六层配置优先级。当前用户明确批准先交付部署层黄金切片。

## Decision

1. 新增版本化 Deployment Config v1；现有 `settings.json` 继续作为载体和向后兼容入口。
2. `identity`、`legal`、`egress`、`services` 与相关部署 feature flag 仅由部署层拥有。
3. 默认 `egress.mode` 为 `deny-external`。外部访问采用 `origin + purpose` allowlist；同源、`blob:` 和 `data:` 不视为外部。
4. 项目、模型、URL 参数、localStorage 和插件不能放宽部署外呼策略。插件可以请求一个用途，最终授权仍由部署策略决定。
5. 应用层通过一个窄策略模块判定外部访问；构建产物同时生成 CSP，作为漏网请求的浏览器边界。
6. 产品身份分成静态首屏身份和运行时身份，两者读取同一配置。项目品牌只能在部署允许的 UI 范围内叠加，不能修改法律告知或外呼策略。
7. 法律/版权与兼容命名不作为品牌字符串迁移目标。

## Alternatives

- **全局替换品牌字符串**：拒绝。会损坏版权、Schema、GLB/项目兼容和真实厂商身份。
- **单一 `offline` 布尔值**：拒绝。无法表达同源、本地工业接口、用户导航和不同用途，也不能形成 allowlist 审计。
- **只包装 `fetch`**：拒绝。无法覆盖 `<img>`、`<script>`、WebSocket、Loader 和导航。
- **等待完整分层配置**：拒绝。部署层可以独立形成安全闭环，组织平台以后只需要生成相同契约。

## Consequences

默认公开构建不再隐式提供远程文档、CONNECT 下载探测、Firebase Demo、GitHub 扫描或远程 QR。需要这些能力的部署必须显式配置服务与 allowlist。配置和部署脚本增加版本/校验/CSP职责，但客户交付不再需要维护源码 fork。

## Compatibility and Migration

现有非安全配置字段继续读取。旧的 `analytics`、`news`、`docs` 字段可以保留，但外部访问仍需新策略授权。`rv_extras`、`userData.realvirtual`、稳定 ID、存储 key 和旧资产路径不变。

## Validation

配置解析单元测试、用途/origin 策略测试、外部 origin 静态门禁、构建产物 CSP/身份测试以及浏览器零外呼旅程共同验证本决策。

## Rollback or Supersession

代码可回退到上一发布版本；配置字段只做加法，旧客户端会忽略新字段。未来组织级配置必须生成或约束 Deployment Config v1，若改变状态所有权需以新 ADR 替代本记录。
