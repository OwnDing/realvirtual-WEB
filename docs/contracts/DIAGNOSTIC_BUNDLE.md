---
doc_id: CONTRACT-DIAG-001
title: Diagnostic Bundle v1
status: approved
owner: architecture
last_reviewed: 2026-10-13
authority: normative
---

# Diagnostic Bundle v1

## 格式

类型标识 `xyvirtual-diagnostic-bundle`，`schemaVersion: 1`，`redactionVersion: 1`。文件名仅用固定产品标识、UTC 时间及随机包编号。

ZIP 固定条目：`summary.txt`、`manifest.json`、`environment.json`、`graphics.json`、`scene-summary.json`、`logs.jsonl`。JSON 降级包含相同报告字段和 manifest，明确 `archive-failed`。manifest 包含范围、采集状态、文件字节数、日志覆盖时间、覆盖/截断/省略数量；文件大小不对 manifest 自身递归计数。

每个环境/图形/场景采集结果含 `status: ok|unavailable|failed|timeout|excluded|changed|truncated`、稳定 code 和只读 data。状态指采集结果，不等于健康认证。单项失败不阻止其余项；用户取消不下载。

## 数据白名单

环境：版本/build/commit/buildDate；浏览器族/版本、系统族、locale、安全上下文、视口、DPR、硬件线程数（若提供）、存储/API 可用性。原始 UA 不输出，以免嵌入客户定制文本。图形：真实 rendererKind、已有 GPU vendor/renderer、实际上下文限制/状态、已有渲染统计。浏览器提供的字符串有长度限制和地址/凭证过滤。

场景：有无模型、工作区枚举、数量、加载 phase/计时/字节数、告警总数。无名称、路径、NodeId、业务数值、坐标/几何、metadata、脚本或生产地址。

日志：时间、level/category 白名单、稳定事件码、内置固定消息或 `[free text omitted]`、脱敏应用栈定位、scene generation。任意 data/参数对象不遍历或调用 toJSON/getter；无法判断文本省略。错误栈只保留本应用同源构建脚本文件名和数字行列，不输出函数名、源代码或完整 URL。

## 上限与生命周期

最多读取 500 条现有日志；额外异常/事件最多 200 条，缓存只保存安全投影。字符串单项最多 4096 字符，整包未压缩数据最多 5 MiB。超限优先保留错误及最近日志，记录丢弃数量。采集单项最多 3 秒；场景遍历最多 100000 节点并分批让出主线程，不挂在每帧更新中。任何取消/场景代际变化停止旧采集；销毁解除监听并释放下载 URL。

页面入口与插件通过引用计数共用异常监听；插件销毁解除自身监听和数据源并取消采集，启动层仍保留页面故障入口的异常捕获。最后一个页面捕获所有者释放时解除全局异常/控制台监听并清空诊断事件。

标准范围 logs/scene 默认开启；排除项仍输出状态，不伪造空成功。ZIP、JSON 和 UI 预览都从相同安全报告序列化，未知字段不得从运行时对象直接扩散到产物。

依据 [ADR-0017](../adr/ADR-0017-local-diagnostics.md)。
