---
doc_id: ADR-0008
title: 双平面统一配置与版本迁移
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-29
authority: normative
---

# ADR-0008：双平面统一配置与版本迁移

## Context

部署身份/外呼已有 v1 契约，但默认语言、工作区和功能开关散落在代码、URL 与多个 localStorage key 中。项目 `settingsRef` 还会调用用户导入逻辑，把项目默认值写成用户偏好。继续叠加字段会导致客户 fork、不可解释优先级与不可回滚迁移。

## Decision

1. 采用双平面：普通值按 `builtIn < deployment < project < user < session` 合并；随后由 deployment snapshot 中的组织/部署 policy 执行锁定、deny 与 capability clamp。
2. 浏览器只消费一个部署快照。组织策略的编辑与合并留在服务器/交付工具，L1 不建设浏览器组织策略编辑器。
3. Deployment Config v2 在 v1 安全字段之外增加 `defaults` 与 `policy`；v1 由纯函数迁移，迁移幂等且保留未知旧字段，但不得激活 v1 中同名的 v2 保留字段。
4. 项目配置使用 `rv-project-config/1.0`；模型/文档只通过稳定 ID 选择项目内 `modelProfiles`，不能成为安全策略来源。
5. 用户配置使用版本化、可 scope 的浏览器记录；会话只解析 allowlist 参数且不持久化。旧 key 读旧写新、暂时双写。
6. 解析器返回 immutable effective snapshot、逐字段 provenance 和 rejected override；消费者不能自行重做优先级。
7. 安全字段继续由 `ADR-0006` 单写：项目以下层级不能改变 identity/legal/egress/services/license。

## Alternatives

- 每个客户维护源码分支：拒绝；长期维护成本与安全漂移不可接受。
- 单纯深合并 JSON：拒绝；无法表达锁、deny、能力上限、来源和数组语义。
- 把模型/文档设为更多独立层：拒绝；会扩大内容对安全和产品壳层的控制，并使同项目语义不稳定。
- 浏览器直接拉取组织策略：本阶段拒绝；增加认证、缓存、离线与敏感信息边界，部署快照已能形成商业交付闭环。

## Consequences

产品可以在不 fork 的情况下交付差异，并能解释有效值。代价是维护字段目录、迁移器与策略应用点；功能开关必须使用稳定 ID，不能靠任意 JSON 键自动启用代码。项目 settings 自动加载从“写用户存储”改为“项目内存 overlay”。

## Compatibility and Migration

v1 配置、缺少版本的旧配置、旧语言/工作区/插件 key 和 `rv-settings-bundle/1.0` 保持可读。写新格式时兼容性双写旧 key；回退旧客户端仍能读取。未知未来 deployment 版本继续采用 v1 已定义的失败关闭行为。

## Validation

通过纯解析/迁移单测、ModeManager/插件策略测试、ProjectStore 无污染测试、启动顺序测试、schema conformance、构建交付测试和浏览器黄金旅程验证。

## Rollback or Supersession

代码可回退；v2 字段会被旧客户端忽略，兼容性旧 key 仍保留。未来若浏览器直接消费组织策略、增加远程配置或改变状态所有权，必须以新 ADR 替代本记录。
