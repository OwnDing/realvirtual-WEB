---
doc_id: CONTRACT-DEMO-PACKAGE-001
title: 单文件演示与导览配方 v1
status: approved
owner: architecture
last_reviewed: 2026-10-06
authority: normative
---

# 单文件演示与导览配方 v1

配方使用 schemaVersion=1，包含 title、locale（zh-CN/en-US）、startCamera（position/target 三元有限数与 fov）、loop 和 steps。每步具有稳定 id、title、description、camera、durationMs（0–10000）及 dwellMs（1000–60000）。最大 50 步，标题最长 120 字符、说明最长 2000 字符，相机坐标绝对值最大 10000000；未知版本和无效结构拒绝。配方下载扩展名 .demo.json。

HTML 内 rv-demo-data JSON 数据块包含 schemaVersion=1、recipe、modelBase64、license、sourceBase64 和 build（version/revision）。JSON 转义 HTML 分隔符，所有模型描述经 textContent 展示。播放器以静态脚本内嵌；不访问原始工作站的 Cookie、localStorage、settings、项目后端或工业接口。

模型最大 128 MiB。支持未压缩自包含 GLB 2.0 和嵌入纹理；编辑器中解析过的压缩模型经规范导出后为未压缩快照。引用必须 embedded=true 且确有解析内容，不允许使用占位替代真实引用。元数据/ID 不改写；明确拒绝外部资源、脚本/WebComponent、未展开引用及压缩扩展。预检失败无下载。

构建输出 demo-player.js、demo-player-source.zip 和 demo-player.json（schemaVersion/version/revision/sha256/sourceSha256）。导出端校验版本与摘要，限制构建产物大小，仅从部署基路径加载。导出文件名使用净化后的标题与 .html 扩展名。

取消、页面/文档切换使当前导出结果失效；已开始的底层编码可结束，但不得触发迟到下载。导览播放中用户拖动相机退出自动播放，重新开始从第一镜头开始；隐藏页面暂停，恢复时继续，尊重减少动态效果偏好。
