---
doc_id: PS-OFFLINE-001
title: WEB 离线运行验收闭环
status: approved
owner: product
last_reviewed: 2026-09-08
authority: normative
---

# WEB 离线运行验收闭环

批准来源：2026-09-05 用户确认上一轮评估的下一阶段定义并要求全部完成。

1. 离线允许应用同源 HTTP(S)/WS(S)、blob/data 本地资源，禁止跨源网络。跨源局域网工业接口使用显式 origin/purpose allowlist 在线部署。
2. offline 预设复用 egress/services 契约；构建时强制拒绝外部访问、关闭外部服务，不可被 Analytics 环境变量放宽。
3. 同源 settings.json 在页面重新加载后生效；项目、用户、模型、查询参数不能放宽策略；配置缺失、损坏或未知版本默认拒绝。
4. 被禁止的 I/O 在发起前返回明确原因，覆盖模型子资源、HTTP、Socket、Worker、外链；不自动重试工业写入。
5. CSP 是兜底；构建和启动使用相同的外呼解析规则，启动只收紧已交付的 CSP。扩大白名单必须同步完整部署产物。
6. CI 测试真实生产包、全新上下文，验证真实模型加载/解码、关键工作区、本地保存重开；只有 canvas 不算成功。
7. 正常旅程没有外呼尝试；策略反例在 I/O 前拒绝；检测器自测检出故意外呼，隔离网络阻止漏网连接并留证。
8. 不宣称 file:// 冷启动、Service Worker 安装、同源后端、浏览器自身更新、客户宿主网络、真实 PLC 或完整 Appliance 已验收。

依据 [ADR-0011](../adr/ADR-0011-offline-runtime-gate.md)、[部署契约](../contracts/DEPLOYMENT_CONFIG.md)；实施与证据见 [EP-OFFLINE-001](../exec-plans/completed/EP-OFFLINE-001-runtime-egress-gate.md) 和 [验收矩阵](../acceptance/ACCEPTANCE_MATRIX.md)。
