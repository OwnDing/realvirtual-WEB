---
doc_id: ADR-0018
title: ADR-0018：兼容性规则与认证证据
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-10-19
authority: normative
---

# ADR-0018：兼容性规则与认证证据

## Context

2026-10-19 用户批准 L3-2 方案及实施。旧 Appliance 矩阵把 Chromium/Edge >=143 视为完整支持，实际自动化基线为 Chromium；最低版本、Edge、物理 GPU 和 XR 证据不完整。L3-1 的只读采集边界已由 ADR-0017 确定。

## Decision

`src/core/compatibility/support-matrix.json` 拥有发布支持规则和证据登记。无 DOM/网络/存储的纯判定模块分别输出能力结果与认证等级。浏览器身份仅用于匹配已声明的有限范围，不能证明实际 OS 版本、硬件或权限。所有正式/有限支持声明必须引用匹配范围的证据；完整支持另需实机证据。运行时不因未认证而硬性封禁 Viewer。

生成器从该源生成 WEB/Appliance 静态检查页资源、机器矩阵、双语表格及旧 v1 矩阵的保守投影；生成物漂移阻断交付。新矩阵使用 v2 路径，旧 `/diagnostics/support-matrix.json` 保留 v1 结构，无法表达的细分认证降为 diagnostic-only。

独立检查页不加载 Viewer，也不依赖最新应用包能够解析。它仅在用户启动后创建临时 OPFS 文件和图形上下文，支持取消、超时、清理，目录授权另需显式手势。没有工业连接或上传。L3-1 面板只增加同源入口，不把主动探测塞入被动采集。报告只含稳定代码、枚举及有限能力数值，不含原始 UA、origin、目录名或任意错误文本。

## Alternatives

维护多份手工矩阵容易漂移；仅看 UA 会误报驱动/企业策略；直接扩展 L3-1 的采集器会突破被动导出契约。均不采用。

## Consequences

客户承诺能追溯到证据；代价是没有真机时只能交付未验证状态及可运行验收工具。独立静态页面可在应用启动失败时使用，认证仍依赖对应生产构建和真实工作流。

## Compatibility and Migration

不迁移 GLB、rv_extras、NodeId、项目、部署配置或浏览器业务存储。不改变渲染选择、XR 行为和工业权限。v1 检查结果结构保留，新 v2 规则与新环境报告另行版本化。

## Validation

见 [验收矩阵](../acceptance/COMPATIBILITY.md)：规则边界、证据完整性、取消/超时、OPFS 清理、无网络副作用、生产资源与中英文 UX、实机认证入口。

## Rollback or Supersession

撤销新增检查入口及资源、恢复上一版生成源并重新生成；不删除用户数据。后续扩展服务探测、认证数据上传或硬性运行封禁需要新的决策。
