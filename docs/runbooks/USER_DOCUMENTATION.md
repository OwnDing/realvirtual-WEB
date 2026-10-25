---
doc_id: RUNBOOK-DOCS-001
title: 用户文档、媒体与错误分诊维护
status: approved
owner: engineering
last_reviewed: 2026-10-23
authority: normative-process
---

# 用户文档维护

内容源在 docs/user，中英文同主题一起更新；清单记录来源，不把旧 reference 文档直接升格。修改功能后检查对应文档步骤、帮助主题、截图、字幕及视频。使用公开模型录制，不在教程中展示客户数据。三段录像的屏幕语言为英文，中文和英文字幕可切换；中文操作名称以双语正文为准。

## 构建与启用

运行 `npm run build:help` 生成 public/user-help，再构建完整应用。`npm run check:help` 检查产物、媒体和分诊；不得手改生成文件。源码仓库的治理、Node 和构建 Harness 都验证帮助；经过裁剪的客户工作区只携带已构建帮助，不要求具有作者文档源。录像由 `node scripts/user-help/record.mjs` 使用真实 dist 与公开 RollConveyor-3m 静态示例完成，输出实际媒体与摘要，并用 finalize-media.mjs 按实际编码时长校准字幕；媒体生成后重建帮助和完整产品。生产验证使用 `node scripts/user-help/verify.mjs`。

帮助默认遵循 services.documentation；null 仍禁用。只在明确选择的交付副本执行 `node scripts/user-help/configure.mjs --dist DELIVERY --page-url https://host/deployment/`，会将该副本的文档地址设为同源 user-help。部署默认配置、外呼允许列表、模型和项目不改变。离线 profile 会禁用文档服务，应在离线构建完成后对交付副本显式启用。直接打开 user-help/index.html 可浏览随包内容；完整复制目录才能保持媒体与搜索可用。

生成包记录产品版本、内容摘要、来源摘要、主题和媒体摘要。媒体记录实际录制输入构建及录制时间；不能将旧视频冒充新 UI。功能变更影响步骤时应重录对应视频。文本输入摘要按 LF 规范化，生成物换行由 .gitattributes 固定。界面来源摘要变化会要求重录。录制使用 Linux 软件渲染，不作为图形性能证据。

离线 file URL 不允许直接读取外部 VTT，页面从随包脚本创建字幕轨，仍提供同内容 VTT 下载。不要改为运行时 fetch 或外部视频嵌入。

## 错误分诊

运行 `node scripts/user-help/errors.mjs`。登记精确路径、文本、重复次序指纹、分类、证据和责任人。新增/改变/移除站点会失败，必须阅读调用链后调整对应记录，不允许全目录豁免或机械刷新为“已翻译”。现有八类硬编码库存仍必须为零。

首发出口是原生模型加载错误、当前文档保存/导出、项目操作、统一导入错误、演示包、视觉呈现、受保护访问和诊断。内部断言保持语义；未知异常展示本地化兜底，不能显示任意 message/对象。技术证据仍使用既有诊断白名单，不把任意异常或客户地址加入诊断 ZIP。

剩余专业域明确登记为 specialist-followup：工业连接与配置、DES、深度编辑/设备库、旧分享流程。它们不属于本轮首发闭环，不能写成全产品错误已全部本地化。后续逐出口迁移并保留反例。此登记不允许新增首发出口绕过门禁。

## 交付验收与回滚

检查同版本页面、搜索、截图和三个视频可读；在部署子路径和断网 file URL 验证；检查旧 slug/anchor、禁用和外部文档配置。按 [验收矩阵](../acceptance/USER_DOCUMENTATION.md) 留证。真实首次使用者走查、硬件最低配置和独立安全认证保持独立。

回滚帮助和错误 UI 接线，恢复交付前 settings.json；保留项目与个人数据。配置变更前保留交付副本，不通过清浏览器存储回滚。
