---
doc_id: RUNBOOK-DIAG-001
title: 本地诊断包导出与排障
status: approved
owner: engineering
last_reviewed: 2026-10-14
authority: normative
---

# 本地诊断包导出与排障

## 客户操作

1. 故障出现后保留当前页面，打开 **设置 → 诊断与支持**。刷新页面会清空本次会话的诊断记录。
2. 查看采集说明。环境、版本和显卡信息始终包含；可以取消 **包含最近日志** 或 **包含场景摘要**。
3. 点击 **刷新预览**，展开 **查看脱敏内容**。预览显示实际文件内容和快照时间。需要采集最新状态时再次刷新预览。
4. 点击 **导出诊断包**。浏览器将下载一个 `xyvirtual-diagnostics-*.zip`；导出使用预览中的同一快照。ZIP 不可用时下载 `.json`，界面明确提示降级。
5. 用户自行审阅下载文件，并按客户的支持流程决定是否发送。应用不会自动上传。采集或打包时点击 **取消**，不会发起下载。

模型加载失败、图形上下文丢失或初始化失败时，错误卡也提供 **导出诊断包**。该入口直接导出默认范围的本地报告，Viewer 不可用的部分标为不可用。JavaScript 根本未启动或浏览器进程已经崩溃时无法保证导出。

入口遵循设置锁定、Kiosk、嵌入和访客可见性规则。诊断导出不改变原有连接设置；已启用的工业连接或 CONNECT 自动重连仍按原逻辑运行。诊断模块本身不建立连接、不探测服务、不写入工业信号或浏览器存储。

## 支持人员读取

ZIP 包包含六个固定文件。先看 `summary.txt` 和 `manifest.json`，核对应用版本、包格式版本、采集时间、范围、覆盖时间及省略计数；再查看 `environment.json`、`graphics.json`、`scene-summary.json` 与 `logs.jsonl`。JSON 降级文件包含同一报告的各 section、logs 和 manifest，并标记 `archive-failed`。

- 加载失败：查看 `LOAD_FAILED`、加载阶段、耗时和已加载字节数。
- 图形故障：查看 `CONTEXT_LOST`、`rendererKind`、`contextLost` 与 `capabilityStatus`。`webgpu-gl` 表示 WebGPU 渲染器走 GL 回退，不能据此推断支持原生 GPU 计算。
- 场景变更：`SCENE_CHANGED` 表示采集期间模型已切换，重新采集即可。`COLLECTION_TIMEOUT` 或 `SCENE_LIMIT_REACHED` 表示结果受时间或节点上限约束。
- 历史不完整：检查 `eventOverflow`、`logOverflow`、`byteLimit` 与 `freeText`。最多保留 500 条应用日志及 200 条诊断事件，刷新后不会恢复。
- 栈定位：生产应用栈保留构建 chunk 哈希和行列号；使用相同版本的内部构建产物定位，不要求客户提供源码或模型。

报告只包含白名单字段。未知日志文本和参数对象会被省略，不能据此还原完整原始异常；事件码、栈定位与阶段摘要提供第一轮排障依据。包中不包含模型、截图、项目内容、设备名称、NodeId、连接地址、凭证、信号值和浏览器存储转储。采集 `ok` 仅表示读取成功，不代表环境通过健康认证。

## 验证与回退

运行 `./scripts/verify.sh static`、`node`、`browser`、`build`。对已完成构建运行 `node scripts/verify-diagnostics-production.mjs`，从真实界面下载并解析 ZIP，检查预览一致性、范围排除、敏感文本省略和真实 WebGL 上下文丢失后的下载。执行 `./scripts/verify.sh offline` 可在隔离网络中运行同一旅程；离线网络探测器仍保持启用。

本地测试输出位于 `test-results/diagnostics/` 和 `test-results/offline/`。生产下载夹具采用用户明确断开 CONNECT 后的持久偏好，隔离既有后台 `/health` 重连；网络断言仅允许加载同源静态模块，不放行服务请求。

自动化环境为 Linux Chromium 与软件 WebGL。真实 WebGPU、移动设备和其他浏览器应在客户目标设备验收。回退时精确撤销新增诊断模块、UI、日志观察接线和相关测试/文档；没有项目、GLB、配置或持久化迁移，无需清除客户数据。

## English quick guide

Keep the failing page open. Go to **Settings → Diagnostics & support**, choose whether to include recent logs and scene counts, then **Refresh preview** and inspect **View redacted contents**. **Export diagnostic bundle** downloads the same snapshot as a ZIP, or a JSON report if ZIP packaging fails. Nothing is uploaded; the customer decides whether to share the file. **Cancel** prevents download. The native error card also offers export before Viewer creation or after graphics context loss. Reloading clears session history. Settings locks and Kiosk/embed/guest restrictions apply. Start troubleshooting with `summary.txt` and `manifest.json`; missing, omitted or truncated data is explicitly marked.

格式依据：[Diagnostic Bundle v1](../contracts/DIAGNOSTIC_BUNDLE.md)。验收：[矩阵](../acceptance/DIAGNOSTIC_BUNDLE.md)。
