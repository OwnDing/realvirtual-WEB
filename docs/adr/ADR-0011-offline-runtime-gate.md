---
doc_id: ADR-0011
title: 离线部署预设与生产网络验收
status: approved
owner: architecture
last_reviewed: 2026-09-08
authority: normative
adr_status: accepted
---

# ADR-0011：离线部署预设与生产网络验收

## Context

ADR-0006 定义部署权威策略，但部分 I/O 和 required CI 尚未闭环。用户于 2026-09-05 批准复用策略、补齐入口、生产门禁及隔离网络的阶段定义。

## Decision

延续 ADR-0006 的 origin/purpose 策略；offline 仅投影既有配置。HTTP 和导航使用显式用途的窄函数，Loader 子资源使用 URL 判定，不全局替换原生 API。构建与启动共享外呼规则，启动收紧 CSP；隔离测试网络独立兜底。生产旅程、负例和检测器故障注入进入已有 required Browser Gate。运行时配置在重新加载后生效，不实现热切断。

## Alternatives

独立布尔配置产生平行策略；只包装 fetch 遗漏导航与 Loader；只断网掩盖外呼尝试和功能失败；域名黑名单无法处理动态 URL，均不足以单独完成验收。

## Consequences

同源资源可用，跨源工业接口须在线显式白名单；新 I/O 必须审计并有正反例；扩大白名单同步 settings/CSP，配置失败默认拒绝。

## Validation

见 [PS-OFFLINE-001](../product-specs/OFFLINE_RUNTIME.md) 和 [EP-OFFLINE-001](../exec-plans/completed/EP-OFFLINE-001-runtime-egress-gate.md)。

## Rollback or Supersession

回退代码和完整部署目录，不迁移项目。后续热切换和服务器外呼控制另立范围。本记录补充 ADR-0006。
