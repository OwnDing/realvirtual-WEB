---
doc_id: EP-BRAND-001
title: L2-5 部署白标
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-10-13
authority: normative
---

# EP-BRAND-001：L2-5 部署白标

## Purpose

同一应用构建通过配置与资源交付完整客户品牌体验。

## Scope

共享解析、Deployment v2 扩展、首屏/HMI/访问页/Appliance/演示导出、PWA/OG、品牌交付工具、测试与文档、功能分支 PR。

## Non-goals

品牌编辑器、多租户、浅色主题、生产部署、真实设备操作、改变项目或 GLB 格式。

## Required Documents and Decisions

用户 2026-10-12 批准方案、功能分支与 PR；[产品规格](../../product-specs/WHITE_LABEL.md)、[ADR-0016](../../adr/ADR-0016-deployment-white-label.md)、[契约](../../contracts/WHITE_LABEL.md)、ADR-0006/0008/0013、Closed OD-003。OD-001 云端范围不涉及。

## Current Repository Facts

起点 develop 与 origin/develop 一致、工作树干净；分支 codex/deployment-white-label。已有 identity 和部分主题，manifest 固定，项目品牌可覆盖部署。Node v22.22.2；gh 未安装，PR 使用 GitHub connector。

## State Ownership and Compatibility

品牌只由部署拥有；v2 可选 branding v1，旧配置回退，项目/GLB/稳定 ID 不变。交付输出由生成源产生，不手改 generated 内容。

## Allowed Paths

- src/core/deployment/**、src/core/hmi/**、src/core/i18n/**、src/core/demo-package/**、src/demo-package/**、src/access/**、src/plugins/login-gate-plugin.tsx、src/main.ts
- scripts/**、schema/**、public/**、appliance/**、tests/**、e2e/**、docs/**、index.html、package.json、vite.config.ts、vite.access.config.ts、.github/workflows/quality-gates.yml

## Forbidden Paths

客户模型、私有 sibling、密钥、生产设备、部署/发布；生成产物手改。

## Milestones

1. M1 契约/Schema/解析器和正反例。
2. M2 首屏→UI→PWA→分享的两品牌闭环。
3. M3 独立入口/导出/交付工具与缓存。
4. M4 完整门禁、浏览器旅程、文档与 PR。

## Progress

- [x] 用户批准、功能分支与治理文档。
- [x] M1：共享解析器、v2 branding 段、Schema、迁移与反例。
- [x] M2：首屏、HMI、品牌署名、manifest 与分享元数据。
- [x] M3：独立访问页、Appliance、单 HTML 导出、内容哈希资源和新目录交付。
- [x] M4：本地门禁、生产旅程、文档、功能分支及 PR #15。

## Surprises & Discoveries

branding-store 项目展开覆盖部署违反 ADR-0008，由本 ADR 限制旧 API 补正。路线图完全缺失描述已过时。

完整浏览器回归发现登录插件原有 footer 被误替换，已恢复为独立附加文案。生产离线演示发现播放器覆盖部署浏览器标题，现保留品牌页签标题与演示页内标题。截图复核发现新 E2E 夹具必须位于 `models/`；已修正并要求首次加载/刷新均进入真实 ready 状态，防止只见品牌而漏检加载失败。最终截图还发现署名与右下工具栏重叠；署名移入随 UI 缩放的 HMI 布局，预留桌面/移动工具区，并添加生产几何位置断言。

PR #15 自动审查指出默认诊断页把浅底文字改成浅色，以及署名 URL 的 Schema 只检查长度。已用失败回归复现：诊断页同步背景、卡片和辅助文字配色，保留状态边框与证书提示语义；Schema 与解析器统一限定本地路径或无凭据、无字面空白/反斜杠的显式 HTTP(S) URL。

## Decision Log

2026-10-12 用户批准方案；保留 identity v1 封闭定义，在 v2 加独立版本 branding；不新增依赖。

白标纯解析与文档投影作为独立、可缓存的 `deployment-brand` chunk，供启动和延迟 UI/导出消费者共用，保持原入口体积预算。该拆分不宣称减少总启动下载量；不改变插件初始化顺序或测试阈值。

主入口最初超出现有字符预算 3,085。共享品牌颜色引用消除重复 CSS 字符串后，最终主入口为 3,519,720 字符（3,561,212 字节），低于原有 3,520,000 字符阈值；品牌共享 chunk 6.90 kB。中间增量构建留下的旧 chunk 导致产物关联检查失败，最终改用干净完整构建复验。

## Validation

governance/static/node/browser/build，聚焦白标生产 E2E、受保护访问与单文件离线演示。实际 PWA 安装、生产交付和移动设备人工 UX 单独披露。

- `./scripts/verify.sh governance`、`static`、`build` 通过；页脚布局修复后的静态/干净构建复验也已通过。
- `./scripts/verify.sh node`：82 文件 / 844 测试通过。
- Browser Gate 八个互补分组：1–7 通过；第八组最初因入口体积和旧构建产物失败，修复并干净构建后第八组 131 文件 / 1,407 测试通过。合计主套件 10,985 项通过，独立性能组 11 项通过；保留原有 12 skipped / 2 todo，没有新增跳过或放宽门禁。
- 最后页脚修复后的 HMI 模式、CONNECT 嵌入壳、帮助快捷键、白标/登录和构建切分回归：7 文件 / 111 测试通过。
- 白标/预启动语言/登录外壳/演示导出组件专项 4 文件 / 30 测试通过，含真实 Logo 栅格化、超限/取消和语言回退。
- `node scripts/test-white-label.mjs`：最终构建的首屏无应用 JS、真实模型首次/刷新 ready、子目录、manifest、严格 CSP 访问壳、不请求 settings 和品牌离线 HTML 通过；页脚位置断言及最终截图复验通过。报告/截图：`test-results/white-label/`。
- `node scripts/test-protected-presentations.mjs`：实际本地 Caddy HTTPS + Node + Chromium 认证/分享旅程通过。
- `node scripts/test-demo-package.mjs`：单 HTML 在 file://、offline Chromium 下真实渲染通过，52,003 几何像素、零外部请求。`node scripts/test-demo-package-authoring.mjs`：实际文档卡片导出、新增设备及坐标保留、复制后离线播放通过；此前并发浏览器下截图超时，隔离运行后通过，未修改原有测试。
- OS 网络隔离离线旅程九个场景通过，零外部请求（`test-results/offline/report.json`）。
- Browser Gate 已加入白标旅程及截图/结果上传；远程 PR CI 由 [PR #15](https://github.com/OwnDing/realvirtual-WEB/pull/15) 触发，状态以 PR 检查为准。
- 无真实设备/PLC、生产系统、私有 sibling、移动设备或真实 PWA 安装验证；不把 SwiftShader 结果作为硬件 GPU 性能结论。

### 合并前审查修复

2026-10-13 用户明确授权合并 PR #15 并删除功能分支。合并前修复两条 P2 审查意见；Node 白标/部署配置 2 文件 / 29 项、浏览器白标/诊断对比度 2 文件 / 12 项通过。合并以静态、构建和最终提交的远程 CI 全部通过为条件，不绕过分支保护或失败门禁。

## Rollback

恢复上一完整应用/配置/品牌目录；无项目数据迁移。开发用提交可 revert，不重写历史。

## Outcomes & Retrospective

实现、交付说明和适用本地门禁已完成；功能分支 `codex/deployment-white-label` 已提交推送并创建 [PR #15](https://github.com/OwnDing/realvirtual-WEB/pull/15)，目标 `develop`；初次交付时未合并或部署，后续合并授权见上节。没有真实设备、生产系统或私有 sibling 操作。
