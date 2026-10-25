---
doc_id: ADR-0020
title: 版本化静态用户帮助与错误展示边界
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-10-23
authority: normative
---

# ADR-0020：离线帮助与错误展示

## Context

用户于 2026-10-23 同意 L3-4 完整方案并要求实施及 PR。已有上下文帮助和部署文档 URL，但没有完整的同版本离线双语用户资料。扫描 error-message 同时计入内部错误码与技术异常，不能用候选数代替 UI 缺口。

## Decision

1. `docs/user/` 拥有版本化 Markdown、主题清单及媒体。构建期将受限 Markdown 安全转为静态 HTML；无新增运行时依赖，不执行 Markdown 中的 HTML、脚本或 MDX。支持的语法由生成器验证，拒绝不安全 URL。
2. 帮助产物在 `public/user-help/`，随 Vite 和 Appliance 的完整 web 产物分发。目录、搜索、图片、视频、字幕和 IT 参考均是本地文件；检索在浏览器本地进行。正文不进入 Viewer 入口 chunk。
3. `services.documentation.baseUrl` 继续是绝对 HTTP(S) 地址，`null` 继续禁用。交付脚本按显式 page URL 生成同源帮助配置；不自动覆盖 null 或客户自有文档站。随包帮助地址使用 `user-help/`，独立于旧外部文档结构。
4. 现有 slug/anchor 契约保留；随包帮助提供别名页。语言作为 URL 查询参数传递，保持同步 window.open 与外呼校验；外部文档地址保持原行为。帮助语言仅影响展示，不写项目或 GLB。
5. 领域错误码留在原领域；UI 保存错误码，在渲染时查双语目录。公共安全错误适配器只保留批准的类别，不保存任意 message 或参数；失败的操作及帮助主题由调用方确定。内部引擎不依赖 locale。
6. 盘点是定位器。分诊登记用路径、源文本和出现次序的稳定指纹与证据管理；新增/改变站点要求重新分诊。UI 出口有独立防原始异常泄漏测试，内部候选不强制归零。

## Alternatives

外部文档 SaaS 无法满足内网交付；将正文塞入 i18n 目录会增加入口包体积并妨碍技术写作；直接展示异常或翻译底层 throw 会丢失稳定诊断语义。完整文档框架目前不必要，先使用小型、严格验证的构建转换器。

## Consequences

内容与代码一起评审和发布；主题、翻译、媒体与版本变化需同步校验。帮助包与视频增加交付体积，但不进入应用初始下载关键路径。无分析埋点、远程搜索或自动上传。

## Compatibility and Migration

不改变项目格式、GLB、NodeId、权限或配置优先级。既有客户 URL 保持原路径，null 保持关闭。旧帮助 slug/anchor 有静态兼容页；未知插件 slug 不冒充已存在页面。运行时错误处理语义不变，禁止根据翻译文本执行业务分支。

## Validation

生成器负例、双语/锚点/媒体检查、生产子路径和 file URL 离线访问、帮助同步打开、语言切换、无外呼、错误码切换及未知文本隔离。现有八类 i18n 门禁和入口预算保持。

## Rollback or Supersession

撤销帮助构建、入口接线和 UI 错误适配；恢复交付前的部署配置。无需清空用户存储或迁移业务数据。未来引入框架、远程服务或新的错误公共协议须另行 ADR。
