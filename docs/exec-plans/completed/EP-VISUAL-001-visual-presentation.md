---
doc_id: EP-VISUAL-001
title: L2-4 视觉呈现产品化
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-10-12
authority: normative
---

# L2-4 视觉呈现产品化

## Purpose

选择风格、编辑资产材质、保存展示效果并导出图片/无声录像。

## Scope

五种风格、基础材质库、项目/个人模板保存、PNG/JPEG与录像、公开UI与中英文、浏览器能力及错误反馈。

## Non-goals

实例材质覆盖、云服务、桌面与音频录制、剪辑、单文件HTML全效果同步、真实设备控制、提交推送发布。

## Required Documents and Decisions

用户2026-10-11认可方案并授权执行。遵守开发宪法、AI安全、文档优先级、DoD；[PS-VISUAL-001](../../product-specs/VISUAL_PRESENTATION.md)、[ADR-0015](../../adr/ADR-0015-visual-presentation.md)、[契约](../../contracts/VISUAL_PRESENTATION.md)。沿用ADR-0004/0008/0014与配置/加载性能规格；不触及OD-001未决服务端范围。旧doc-persistence/lifecycle/extending/ui-visibility/events仅作参考并与代码交叉验证。

## Current Repository Facts

起点develop，干净工作树；特性分支codex/visual-presentation。存在Default/Fast/Sketch及VisualTab；一个本地HDR；公开SmartAssetEditorPlugin拥有AssetDocument；现有setMaterial受引用保护且不能直接用于batched Viewer。MCP已有完整帧捕获，无用户MediaRecorder路径。

## State Ownership and Compatibility

项目配方属于现有项目settings/profile；个人模板属于用户；导出临时覆盖属于会话；材质属于可编辑资产文档。保持原GLB/ID/演示包与部署限制。

## Allowed Paths

src/embed构建边界（只修复既有HMI泄漏）、src/core/presentation、src/plugins/visual-presentation、现有viewer捕获窄接口、配置/项目设置、公开资产编辑器、i18n、main注册、tests/e2e、docs、schema、public/presentation预览资源。

## Forbidden Paths

私有sibling、生成围栏、lockfile、工业写接口、客户资源、发布脚本。

## Milestones

M1 风格→保存重开→1080p图片；M2 材质→撤销重做→保存；M3 4K/透明与手动/环绕/导览录像；M4 综合门禁、E2E、离线资源与说明。

## Progress

- [x] 只读取证及用户批准
- [x] 产品规格、ADR与契约
- [x] M1
- [x] M2
- [x] M3
- [x] M4；真实 GPU、多浏览器与人工美术另行验收

## Surprises & Discoveries

路线图的“纯开发者能力”已落后于现有VisualTab；不能重复建立视觉设置框架。私有材质库stub不能作为公开功能。

真实UI发现旧toolbar-button已无渲染宿主，改用activity-bar与统一LeftPanel。BrowserBackend原readSettings忽略settingsRef，已补充文件优先、旧inline回退。可选embed构建启用后，原有resolver→project-store动态依赖拉入React/MUI，违反现有embed契约；在独立库构建中裁掉不存在的工作区项目查询，保留库与相对路径解析，主应用行为不变。首轮Node还受同时运行两个embed构建共用staging目录影响；后续串行验证。

## Decision Log

2026-10-11 用户认可完整方案；WebGL正式基线、材质限可编辑资产/副本、无声场景录像。细节采取原生浏览器API与窄模块，无新增依赖。

2026-10-12 用户在本地验收交付后明确要求提交、推送并合并到develop；交付授权扩展至Git提交、特性分支推送及PR合并，生产部署仍不在范围内。合并遵守远程门禁，不绕过保护。

## Validation

已通过聚焦Node配方校验4例、Browser 4文件19例（真实透明PNG与4K JPEG像素、可播放手动/环绕/导览录像、取消/后台/重入/编码错误、材料共享隔离与撤销、CAS/实际BrowserBackend重开、生命周期与过期异步覆盖）。

Playwright `e2e/visual-presentation.spec.ts --project=chromium --trace on` 于2026-10-11通过（1/1，3.4分钟），覆盖导入公开GLB→选中材质→应用/Undo/Redo→保存→项目风格/个人模板→1080p PNG/视频下载→刷新并重新打开→材质和项目风格恢复。截图已检查。软件GPU无法证明硬件性能；GPU告警是测试环境事实，不做屏蔽。首次旧插槽与按钮遮挡均通过改用现有ActivityBar/LeftPanel解决；录像重复主循环绘制已修复，未放宽断言，软件GPU流程为停止动作保留60秒测试等待。

`./scripts/verify.sh all`中治理、Lint、类型、完整Node（81文件822例）、完整Browser（1043文件10986例，包含独立性能11例）均通过；保留原有5个跳过文件、12个跳过测试、2个TODO。embed build与依赖隔离4例通过。综合任务的生产构建日志完整，但2026-10-12读取外层退出码为143，单独重跑构建以确认，不把被终止的外层进程称为成功。所有构建串行使用共享embed staging目录；首轮并行构建造成的ENOENT不作为通过依据。未运行远程CI、真实设备、硬件GPU、移动/多浏览器与人工美术验收。

2026-10-12独立`./scripts/verify.sh build`退出码0，主应用/access/demo-player构建完成；最终产物`tests/bundle-splitting.test.ts`14/14通过，预算未改变。入口计数为3,519,046个UTF-16代码单元（现有门禁使用string.length，阈值3,520,000）；实际UTF-8大小3,560,538字节，剩余门禁余量较小。


## Rollback

代码回退时取消main中的插件注册及相应模块变更，保留原VisualTab/资产保存路径与项目可选配方；不删除用户配置或原资产。

## Outcomes & Retrospective

M1–M4功能与本地自动化交付完成，真实GPU及人工美术不作已验收声明。无新增运行依赖或远程运行时资源。原HDR的官方文件MD5已核对，来源与兼容边界见[使用说明](../../delivery/VISUAL_PRESENTATION_OPERATIONS.md)，命令、偏差与回退见[交付记录](../../delivery/snapshots/visual-presentation-2026-10-11.md)。本地验收结束时未提交、推送或部署；后续提交合并按2026-10-12用户授权执行，远程结果以对应PR及Checks为准。
