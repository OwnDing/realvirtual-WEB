---
doc_id: ADR-0013
title: 单文件演示快照与声明式离线导览
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-10-06
authority: normative
---

# ADR-0013：单文件演示快照与声明式离线导览

## Context

用户明确要求 L2-2 单 HTML 断网双击打开。既有 offline WEB 门禁只验证 HTTP(S) 同源部署，不能推导 file:// 可用。既有 ESM embed 构建和 Kiosk TypeScript 函数不能直接放进单文件；演示导出不得把 L2-1 的服务器权限误当成离线保护。

## Decision

增加独立 IIFE 播放器构建，复用 RVEmbedViewer 和 RVEmbedDirector；不改变现有 embed ESM 构建约束。模型从内嵌字节解析，导览采用相机和纯文本的有限声明式格式，任何模型代码及网络依赖在导出前与播放前拒绝。CSP 只允许文件内脚本及 blob/data 本地资源，网络默认拒绝。

导出能力通过 ActiveDocumentView 能力边界提供，由当前文档写入方决定模型；在导出克隆上标记已解析的引用并复用标准 GLB 序列化、元数据及运行时对象清理，不修改运行场景的引用标志。初始相机和导览是演示产物所有的数据，版本化配方文件负责保存重开，不改变项目/文档持久格式与 GLB 稳定 ID。

导出运行时来自当前部署同源构建产物，缺失或版本不兼容时明确报错。包保留许可证及构建来源，并提供随构建生成的公开播放器源码归档；归档采用显式源码目录白名单，排除 public 模型、项目数据、私有 sibling 和运行环境。无新增依赖或服务器。

## Alternatives

ZIP 加本地服务器不符合本次用户选择；把整个工作台嵌入 HTML 会携带多余接口与依赖；序列化 TypeScript 函数/闭包不可移植；下载上游 CDN 运行时不满足冷启动离线；只缓存网页无法作为可复制交付物。

## Consequences

单文件体积含 Base64 开销，限制规模并给出进度/失败。公开 embed 的渲染和仿真覆盖不等于完整工作台，未支持依赖明确拒绝。离线文件没有远程撤销能力。导览配方显式保存，避免新的隐式全局状态。

## Compatibility and Migration

现有项目、GLB、NodeId、导览 API 与 L2-1 API 不变。新产物 schemaVersion=1，未来未知版本拒绝。新增导出能力为可选项，旧文档视图和导出路径保持行为。

## Validation

验证当前文档/编辑器导出、材质与引用/ID 兼容、运行态清理、切换/取消、纯文本注入、损坏/超限与外部依赖；使用真实生产导出产物、全新浏览器上下文、断网 file:// 冷启动，并断言几何、相机、导览、截图像素及零网络尝试。适用治理、静态、Node、浏览器与构建门禁通过。

## Rollback or Supersession

回退新增入口、模块与构建步骤；不迁移或删除用户项目。已导出的文件保持独立。后续扩大可执行内容或资源格式范围须另行评审安全与离线证据。
