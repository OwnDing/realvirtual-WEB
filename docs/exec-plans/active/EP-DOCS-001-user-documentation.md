---
doc_id: EP-DOCS-001
title: L3-4 双语文档、离线帮助与错误提示
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-10-25
authority: normative
---

# EP-DOCS-001

## Purpose

实现完整用户支持闭环，验证后向 develop 创建 PR。批准来源为 2026-10-23 用户“同意。完成整体方案。开pr”。

## Scope

十二个双语主题、FAQ、本地帮助和搜索、三段真实操作视频及双语字幕、错误分诊与首发出口治理、生成/运行门禁和维护手册。

## Non-goals

不改变工业接口、权限、项目/GLB 格式；不关闭 OD-006 或其他计划的实机/独立认证缺口；不发布部署。后续合并授权见 Decision Log。

## Required Documents and Decisions

- [产品规格](../../product-specs/USER_DOCUMENTATION.md)、[ADR-0020](../../adr/ADR-0020-offline-user-help.md)、[验收](../../acceptance/USER_DOCUMENTATION.md)。
- [i18n](../../product-specs/MULTILINGUAL_LOCALIZATION.md)、[部署](../../contracts/DEPLOYMENT_CONFIG.md)、[诊断](../../contracts/DIAGNOSTIC_BUNDLE.md)。
- [运行手册](../../runbooks/README.md)、[视觉呈现](../../delivery/VISUAL_PRESENTATION_OPERATIONS.md)、[未决事项](../../governance/OPEN_DECISIONS.md)。

## Current Repository Facts

初始 develop @ 270541c，工作树干净，origin 为 OwnDing/realvirtual-WEB。工作分支 codex/l3-4-user-documentation。库存 schema v3：八类 0，error-message 557/153 文件。部分候选已是本地化错误码，不能据此认定 557 个 UI 缺陷。现有 Demo/Presentation 错误文字在事件时保存，语言变化不更新。

## State Ownership and Compatibility

内容由版本化源和生成器拥有；locale 属于用户展示；部署决定帮助地址/关闭；错误状态仅保留批准的码。项目、GLB 和配置 Schema 不迁移。

## Allowed Paths

- docs/、scripts/、tests/、e2e/
- src/core/hmi/、src/core/i18n/、src/core/demo-package/、src/core/diagnostics/、src/core/share/
- src/plugins/visual-presentation/、src/plugins/diagnostics/、src/core/user-help/、src/core/user-errors/
- src/main.ts（仅加载错误展示）、src/access/main.tsx（仅错误 key）、src/plugins/unified-import/（仅错误展示）
- public/user-help/（仅生成）、README.md、package.json、.gitattributes、.github/workflows/quality-gates.yml

## Forbidden Paths

生产设备、客户资产、私有 sibling、现有持久化格式、锁文件、全局清理、直接 push develop/main。

## Milestones

M0 规格与逐站点分诊；M1 双语快速上手到离线 HTML；M2 十二主题和首发错误出口；M3 成片、字幕和完整帮助包；M4 综合门禁、生产旅程、人工证据缺口记录、PR。

## Progress

- [x] M0 用户批准与规范落地。
- [x] M0 完整错误分诊：557 个精确站点，含 119 个专业域后续项。
- [x] M1 首个完整流程：公开模型、实际导出 HTML、断网接收者播放。
- [x] M2 十二主题、双语 22 问 FAQ 与首发错误出口。
- [x] M3 三段真实 UI 视频、双语字幕、96 个可复现交付文件。
- [x] M4 自动化验收执行与 PR 交付；未通过门禁与人工缺口见验收记录。
- [ ] 首次使用者 15 分钟走查（需要真实首次使用者，不能由 Agent 冒充）。

## Surprises & Discoveries

本机有 Playwright Chromium 和 ffmpeg 工具，暂无系统 ffmpeg/gh；PR 使用 GitHub connector。整体门禁已包含 L3-3 supply-chain，既有未解决风险不能靠本任务放宽。

公开 conveyor-sensor 示例包含 Director 脚本，按既有导出保护被拒绝。教程改用公开 RollConveyor-3m，保留保护并附可下载模型。Chromium 将 file URL 字幕视为跨源，帮助包使用本地脚本携带同一字幕数据，并保留 WebVTT 下载。

客户裁剪源码不携带 docs/user 作者源。交付打包将 README 的三处用户文档链接定向到已携带的 public/user-help；源码仓库 Harness 校验生成物，客户 npm build 直接复制已生成帮助。回归测试覆盖该交付差异。

## Decision Log

2026-10-23：用户批准前轮整体方案，接受 PS-DOCS-001/ADR-0020 并激活此计划。机器/Agent 操作与真实首次使用者走查分开报告。

2026-10-24：用户明确要求合并 PR #19 至 develop，并删除功能分支。合并前 CI 显示 Browser Gate 的导入排障测试仍固定断言旧英文句子，与已批准的双语行为不一致；同步为显式切换中英文、分别验证三类可操作指引，并保留未知错误反例。通过仓库必需检查后正常合并，不修改分支保护或安全策略。

2026-10-25：后续 CI 已通过全部八个浏览器分片，但渐进加载生产旅程的全页面 Retry 定位同时匹配原生加载层与预览反馈面板。将定位限定在该旅程验证的 `model-load-feedback` 面板，保留按钮可见、真实点击及最终 ready 的断言；不使用首个匹配或放宽严格定位。

2026-10-25：提交 `153341d` 的全量浏览器分片通过，白标生产测试捕获了夹具缺失的可选性能清单 404；源文件先完成时该请求被取消，因而旧夹具的结果依赖请求先后顺序。使用现有性能包生成器补齐同一测试模型的派生资源，明确验证清单 HTTP 成功，并将资源错误收集扩展到派生目录。保持全部品牌、离线、CSP 和零错误断言，缺包回退仍由独立加载旅程覆盖。

## Validation

运行 governance/static/node/browser/build/all；生成器拒绝注入、缺翻译、断链、过时媒体和未知错误站点；浏览器测试语言切换和隐私；生产脚本验证实际 UI、下载、断网接收、帮助搜索和视频解码。所有未运行或失败检查记录在 Outcomes。

## Rollback

按提交撤销新增文档生成与入口、错误展示变更；恢复交付配置，不删除项目或浏览器数据。生成目录通过源重新构建，禁止手工修改。

## Outcomes & Retrospective

已交付十二个中英文主题、每种语言 22 问 FAQ、旧 slug/anchor 路由、本地搜索、打印、F1/错误帮助入口和三段 1080p 实际 UI 录像（164.40、162.80、140.68 秒）。帮助可以从 HTTP 子路径或断网 file URL 使用，字幕与文字步骤一并交付。

557 个候选按精确站点分诊：内部契约 162、已本地化错误码 130、首发 UI 出口 146、专业域后续 119。新增、改动、移除及无证据记录均触发门禁；八类硬编码 UI 库存仍为零。119 个后续项有责任与证据登记，不代表全产品报错全部本地化。

实现及自动化验收记录已完成，随本分支提交草稿 PR。治理、静态检查、87 文件/883 项 Node 测试、相关浏览器回归、最终生产构建和真实离线旅程通过。综合 all 在未修改的脚本引擎 5 ms 中断测试处失败，该文件独立复核 15 项通过；后续分片未由此次 all 执行。供应链复核仍因既有锁文件漏洞分诊和许可证证据阻断。完整结果见 [验收矩阵](../../acceptance/USER_DOCUMENTATION.md)，没有将失败或未运行检查标为通过。

供应链阻塞不在本任务放宽；真实首次使用者 15 分钟走查尚待参与者，因此计划保持 active。PR 已按后续授权转为 ready，合并不代表商业发布获准。真实设备、Windows/macOS 目标机器运行时及独立安全认证不因本地 Chromium 或 Windows CI 兼容性结果获得通过结论。
