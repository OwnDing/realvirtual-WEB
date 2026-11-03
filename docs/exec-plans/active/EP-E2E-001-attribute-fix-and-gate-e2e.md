---
doc_id: EP-E2E-001
title: 第二轮整改第 3 步：e2e 失败逐条归因、修复并纳入 CI
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-03
authority: normative-process
---

# EP-E2E-001：第二轮整改第 3 步：e2e 失败逐条归因、修复并纳入 CI

## Purpose

完成后，`./scripts/verify.sh e2e` 在干净检出上全量通过（无新增跳过），并作为 CI 的 `E2E Gate` 在每个 PR 上运行；EP-GOV-004 M3 遗留的“13 个未归因失败”全部有可复核的归因。维护者可以在评审时相信：e2e 红 = 产品或用例真的坏了，而不是门禁本身不可信。

## Scope

- 2026-11-03 在 `develop`（`51cf9b2` 起，第 1 步合入后 `f9b35b6`）上重测 e2e 基线并逐条归因。
- 修复用例与测试基础设施：欢迎框未关闭、语言未固定、共享调试快照被并行页面覆盖、embed 产物未构建、伪造 FPV 模式被工作区上限拒绝、绑定绕过弹窗读取的持久化路径、沉没测试的时间窗短于演示周期。
- 修复 connect-embed（CONNECT 嵌入演示）三处产品缺陷（用户 2026-11-03 选择“三项都修”）：
  1. Projects 面板在演示运行时自行弹出并盖住演示；
  2. 演示加载失败时两个错误界面并存，全屏加载层盖住演示自己的错误卡片；
  3. 演示没有任何关闭入口（`closeConnectEmbedDemo()` 无调用方，用例所点的模型行关闭按钮在本仓从未存在）。
- 修复过程中暴露的另外两处产品缺陷（同属“让 e2e 真实通过”的范围，交付报告中单列）：
  4. `?model=<文件名>` 被原样当作相对 URL 获取（`/DemoRealvirtualWeb.glb` 命中 SPA 回退页），欢迎框自带的“HMI 演示”链接因此必然报“模型无法加载”；`doc-persistence.md` 早已把“`?model=` 原样使用”登记为身份分裂但未修。
  5. 正式 rv-embed 产物在浏览器中加载即抛 `process is not defined`：i18n 运行时的 React 绑定（react-i18next → react，CommonJS）读取 `process.env.NODE_ENV`，库模式不替换它，而该产物是直接以 `<script type="module">` 加载的 CDN 包。既有 dist 守卫的标记只查 `react-dom`/MUI，查不到 React 核心。
- 新增 CI `E2E Gate` 与结构守卫（无 retry、无 `continue-on-error`、全量套件）。

## Non-goals

- 不配置分支保护 required checks（OD-005 规定属仓库管理员操作；交付报告中提示用户是否把 `E2E Gate` 加入 required）。
- 不改信号绑定语义、持久化格式、GLB/`rv_extras`、Schema、网关与 Appliance。
- 不改演示模型的机器人节拍；不重写 `debug-endpoint` 的单快照设计（只让用例不再依赖它承载页面私有状态）。
- 不扩展 Projects 面板的项目浏览能力；connect-embed 下“模型”入口改为演示行面板，项目浏览不在嵌入演示的范围内。

## Required Documents and Decisions

[`EP-GOV-004`](EP-GOV-004-gate-that-gates.md) M3（本计划完成其遗留归因）；[`GOV-HARNESS`](../../governance/HARNESS.md)；AGENTS.md P0（不得删除、跳过、静音、放宽或伪造测试来使门禁通过）；ADR-0001（i18n 目录与逐字校验）；ADR-0014（渐进加载与加载反馈层）；ADR-0008（工作区模式上限）；[ADR-0027](../../adr/ADR-0027-entry-budget-raise-2026-11.md)（入口预算）；KD-003（embed 构建缺 CI 强制证据）；用户 2026-11-03 指令“按你建议的顺序，从第 1 步开始做，做到第 5 步”与本步选择“三项都修”。

## Current Repository Facts

- 基线（2026-11-03，本机 Darwin / Apple Silicon，`npx playwright test` 全量、默认并行）：**87 例：63 通过 / 19 失败 / 5 跳过**（2026-08-23 记录为 82 例：63 / 13 / 6）。
- 同一批失败用 `--workers=1` 对热 dev server 重跑：15 个稳定复现；`inline-signal-linking`、`picker-keyboard`、`scene-link-migration` 通过；对 `vite --force` 冷启动再跑仍通过。
- e2e 不在 CI 中；`playwright.config.ts` 的 `embed-chromium` 项目预览 `dist-embed/`，但没有任何步骤构建它。
- dev server 的 `/__api/debug` 只保存一个全局 `latestSnapshot`，所有已打开页面每秒覆盖一次；该快照从未包含相机数据。

## Attribution（19 个失败）

| # | 用例 | 归因 | 类别 | 处理 |
| --- | --- | --- | --- | --- |
| 1–3 | `hmi-panels` settings / hierarchy / close | 首次访问的欢迎框（`rv-welcome-dismissed` 未设）拦截指针事件，点击等待到 60 s 超时 | 用例 | 预置欢迎框已读 |
| 4–5 | `camera-startpos` ×2 | 同上欢迎框；另读取共享调试快照的 `camera.position`，该字段从未存在，且并行时会读到别的页面；关掉欢迎框后又暴露 `?model=DemoRealvirtualWeb.glb` 加载失败（全屏“模型无法加载”） | 用例 + 基础设施 + **产品缺陷 4** | 预置欢迎框已读；改从本页 `__rvViewer.camera` 读取；修 `?model=` 解析 |
| 6 | `sink-test` | 演示机器人回放一次装卸共 4,329 帧（卸料段止于 4,300 帧，约 72 s@60 fps），无头实测首件入沉没约 88 s；用例 5 s + 60 s 窗口必然落空。并行时还会读到别的页面的共享快照 | 用例前提 + 基础设施 | 等到首个“Unloading”序列结束后断言 `consumed > 0`；从本页读取计数 |
| 7 | `signal-link-mode` fpv | 用例注册伪造 `fpv` 模式，ADR-0008 的工作区模式上限拒绝未知模式（`setMode('fpv') ignored`）；真实 FPV 是 `fpv` 插件设置的 UI 上下文，不是模式 | 用例（随产品演进过期） | 通过真实 FPV 插件进入 FPV |
| 8 | `signal-link-mode` pending | 未固定语言，断言英文 `Pending` 收到中文 `等待中` | 用例 | 固定 `en-US` |
| 9 | `slot-authority` | 用例只调用 `signalBindingManager.bind()`；弹窗自 plan-325 §9.10 起从持久化 `persistence.read()` 构建行模型，看不到未持久化的运行时绑定；且“实时绑定不显示状态徽标”是 plan-341 §2.8 c 的既定规则（用户 07-30 决定），用例期望的 `bound` 文本与之冲突；另未固定语言 | 用例前提 | 通过 `McpSignalBindTools.webSignalBind`（持久化路径）绑定；断言行内显示所绑信号且无徽标；服务侧 `bound`/`forced`/解除强制回放/切模型清零断言全部保留 |
| 10–13 | `connect-embed` 模型行关闭 ×3 + 触屏 44 px | 关闭入口不存在：`connect-embed-close-scene` 只出现在用例中；`closeConnectEmbedDemo()` 无调用方；“模型”按钮打开的是全屏 Projects 面板，且该面板已自行弹出，点击反而把它关掉 | **产品缺陷 3 + 1**；第 13 条另有新建上下文未固定语言 | 修产品；新上下文固定语言 |
| 14 | `connect-embed` 移动端提示 | Projects 面板在演示运行时自行弹出，盖住 CONNECT 面板的关闭按钮；修复后又发现仅 dev server 存在的检出横幅（`ServeSessionBadge`，构建中被消除）在 390 px 宽度下压住同一按钮 | **产品缺陷 1** + 开发环境 | 修产品；用例先关闭 dev 横幅 |
| 15 | `connect-embed` 加载失败重试 | 演示门的错误卡片与 ADR-0014 全屏加载层同时显示错误与“Retry”，后者盖住前者；通用重试不经过演示门状态机 | **产品缺陷 2** | 修产品 |
| 16 | `embed-smoke` | `dist-embed/` 未构建，预览服务器返回非 200；构建后暴露产物加载即抛 `process is not defined`（0 / 2 实例就绪） | 基础设施 + **产品缺陷 5** | embed 预览前先构建；embed 构建替换 `process.env.NODE_ENV`；dist 守卫新增“输出中不得残留 `process.env`” |
| 17–19 | `inline-signal-linking`、`picker-keyboard`、`scene-link-migration` | 基线运行期间本会话在工作树中修改了被加载器引用的源文件（`rv-sig-public-key.ts` 等），Vite HMR 整页重载打断用例（调用日志 `navigated to "http://localhost:5177/"`、`__rvViewer` 为 undefined）；单跑热/冷启动均通过 | 基线采集伪影 | 不改；全量复测时工作树保持静止 |

## State Ownership and Compatibility

- connect-embed 模型面板是 `leftPanelManager` 的一个左侧面板（id `connect-embed-models`），不新增持久化状态；关闭演示沿用既有 `closeConnectEmbedDemo()`（清模型 + 回到演示门），刷新后仍需点击开始（与 plan-373 F9 一致）。
- Projects 自动弹出只增加“已配置嵌入演示”这一否决条件，非 connect-embed 部署行为不变。
- 加载反馈层只在演示门可见（演示未运行）时被抑制；演示运行后的其他加载照常显示。
- `?model=` 只有“裸文件名且命中模型目录”时改写为目录 URL；路径、绝对 URL、带查询串或未知名称原样保留。该入口的 `baseKeyOf` 因此与默认启动一致（此前在本构建中该链接根本加载不了，不存在需要迁移的草稿）。
- rv-embed 产物改为在构建时固定 `process.env.NODE_ENV = "production"`，运行行为与依赖集合不变。

## Allowed Paths

- `e2e/**`、`playwright.config.ts`、`.github/workflows/quality-gates.yml`、`scripts/verify.sh`、`tests/**`、`docs/**`
- `src/plugins/connect-embed/**`、`src/core/hmi/App.tsx`、`src/core/hmi/HMIShell.tsx`（仅 Projects 面板可见性规则）
- `src/core/hmi/projects/projects-auto-open.ts`、`src/core/hmi/projects/ProjectsDashboardHost.tsx`、`src/core/hmi/projects/projects-dashboard-store.ts`（入口重定向）
- `src/core/hmi/load-feedback.ts`、`src/main.ts`（加载反馈绑定与 `?model=` 解析两处）、`src/core/model-url-param.ts`（新增）
- `vite.embed.config.ts`（仅 `define` 一项）
- `src/core/i18n/catalogs/en-US.deferred.ts`、`zh-CN.ts`（`connect.embed` 新增键）、`scripts/i18n-verbatim-check.mjs`（新增键豁免）

## Forbidden Paths

`schema/`、`gateway/`、`appliance/`、`src/core/engine/**`、`src/plugins/signal-bind/**`、`src/core/persistence/**`、`public/models/**`、`docs/user/media/**`，以及用户帮助教程视频钉住的源文件（`scripts/user-help/media-sources.mjs`，含 `src/core/hmi/ActivityBar.tsx`）；不修改任何既有断言的期望值来迁就实现（用例前提修正须在归因表中写明证据）。

## Milestones

1. **M1 归因**：上表，含重跑证据。
2. **M2 用例与基础设施修复**：#1–9、#16；正例为对应用例通过，反例为不引入 `test.skip`/`fixme`/retry。
3. **M3 产品修复**：缺陷 1–3 及单元测试；#10–15 通过。
4. **M4 CI**：`E2E Gate` 作业 + 结构守卫；全量 e2e 本地两轮通过；远程 PR 上通过。

## Progress

- [x] M1 归因（2026-11-03）
- [x] M2 用例与基础设施修复（2026-11-03）
- [x] M3 产品修复：缺陷 1–5（2026-11-03）
- [~] M4 CI：`E2E Gate` 作业、结构守卫与 KD-003 产物守卫已加；本地全量见 Validation；远程待 PR

## Surprises & Discoveries

- `debug-endpoint` 的命令队列与快照对所有页面共享：并行 e2e 中任何读取它的用例都可能拿到别的页面的数据。本计划只让用例不再依赖它承载页面私有状态。
- `signal-link-mode` 原 fpv 用例在工作区上限加入前就依赖“注册任意模式即可切换”，这是 ADR-0008 有意收紧的行为。
- 基线 19 个失败中 3 个是本会话自身的并发编辑造成的；采集基线时工作树必须静止。
- 被欢迎框挡住的用例一旦能点击，就暴露了其后的真实缺陷（`?model=`）；`embed-smoke` 一旦有产物可测，就暴露了产物本身无法运行。“从未运行”的用例掩盖的不只是用例自身。
- `hmi-panels` 三例原本在找不到按钮或面板时 `test.skip` 自己；改为按角色断言具体面板，删除三处 skip（e2e 目录 skip/fixme 由 19 降为 16，并由守卫锁定不再增长）。
- `ActivityBar` 与 `App.tsx` 的注释仍描述上游的 Models 左侧面板（“Models panel host … shared by the full HMI and the embed shell”），但组件在导入时已不在本仓；connect-embed 下恢复的是同一位置的左侧面板。
- rv-embed 的 AGPL 横幅 `Corresponding Source:` 指向 `github.com/xyvirtual/XYvirtual-WEB`（404，改名遗留）。属 OD-010 / A-02 源码交付事项，本步不改，交付报告中列出。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-03 | e2e 归因后修复并纳入 CI | 用户指令“按你建议的顺序……做到第 5 步”（第 3 步） |
| 2026-11-03 | connect-embed 三处产品缺陷全部修复，而非隔离或删除用例 | 用户当前明确指令（选择“三项都修”）；P0 禁止以跳过/删除测试换取通过 |
| 2026-11-03 | connect-embed 下“模型”入口打开演示行左侧面板，不再打开 Projects 面板 | 演示门按 `leftPanelManager` 左侧面板宽度居中（原设计即左侧面板）；嵌入演示不提供项目浏览 |
| 2026-11-03 | 入口改道通过 Projects 面板 store 的入口重定向 + `HMIShell` 可见性规则实现，不改 `ActivityBar.tsx` | `ActivityBar.tsx` 被导航教程视频的源摘要钉住（`DOC_VIDEO_UI_DRIFT`）；改它须重录 23 MB 视频，而该教程根本不经过 connect-embed 路径；手改摘要等于伪造证据。代价：connect-embed 下入口提示文字仍为“项目”，记入遗留 |
| 2026-11-03 | `E2E Gate` 是否加入 required checks 由用户决定 | OD-005：分支保护属仓库管理员操作 |
| 2026-11-03 | 一并修复缺陷 4（`?model=` 裸文件名）与缺陷 5（rv-embed `process.env`） | 用户“三项都修”的同一意图（让 e2e 因产品可用而通过）；两处修改面小且可独立回退；在交付报告中单列告知 |
| 2026-11-03 | `slot-authority` 改断言“实时绑定无徽标”，不改产品去显示 `bound` | plan-341 §2.8 c 用户决定（07-30）是现行规则；服务侧权威断言全部保留 |
| 2026-11-03 | CI 中以 `RV_REQUIRE_EMBED_DIST=1` 强制运行 rv-embed dist 守卫 | KD-003 的剩余工作即“正式构建 + 守卫的 CI 证据”；远程通过后在结案中关闭 KD-003 |

## Validation

本地（2026-11-03，Darwin / Apple Silicon 10 核 16 GB，Node 22；全量 e2e 均为 `CI=1`，工作树静止）：

- 基线（`f9b35b6` 前的 `develop` 内容 + 本会话未提交改动，默认 5 workers）：87 例 63 通过 / 19 失败 / 5 跳过；同批失败 `--workers=1` 热/冷（`vite --force`）重跑见 Attribution。
- 修复后逐项：`hmi-panels`、`camera-startpos` 6/6；`signal-link-mode` 7/7；`sink-test` 通过（首件消耗于第一次机器人周期内，帧 4,027）；`slot-authority` 通过；`connect-embed-e2e` 8 通过 / 1 既有 `fixme`；`embed-smoke`（先构建再预览）通过。
- 全量四轮：

  | 轮次 | workers | 结果 | 失败 |
  | --- | --- | --- | --- |
  | 1 | 5 | 81 / 1 / 5 跳过 | `paintline-assembly` |
  | 2 | 5 | 79 / 3 / 5 | `paintline-assembly`；`visual-presentation`（产品提示“Browser encoding failed. Check memory…”，同期本机可用内存曾降至约 0.1 GiB）；`connect-embed` 粗指针例启动断言 5 s 超时（已改为与其他启动门一致的 30 s 启动预算） |
  | 3 | 3 | 81 / 1 / 5 | `paintline-assembly` |
  | 4 | 5 | **82 / 0 / 5** | — |

- Node：`./scripts/verify.sh node` 99 文件 / 958 例通过、1 例按条件 skip（`RV_REQUIRE_EMBED_DIST` 未设时的必需性检查）；新增 `e2e-gate`、`model-url-param`、`projects-entry-redirect` 与扩展后的 `embed-spike`（`RV_REQUIRE_EMBED_DIST=1` 下 6/6）。`static`、`governance`（191 份）、`build` 退出 0；`node scripts/i18n-verbatim-check.mjs` 2,562 条通过。
- Browser：`CI=1 ./scripts/verify.sh browser` 八个主 shard 与性能套件全部通过，1,063 文件 / 11,129 例通过、3 文件跳过、零失败（首轮因 `rv-share-boot` 钉住 `const urlModel = params.get('model')` 源码行而失败，已保留该行、改在选择 `modelToLoad` 时解析后重跑）。
- 入口 chunk 实测 3,522,609 字符（ADR-0027 预算 3,600,000；第 1 步基线 3,519,856，+2,753 为新增 zh-CN 文案与演示模型面板）。

**未解决（如实记录）**：`paintline-assembly` 在全量并行中间歇性失败（4 轮中 3 轮），单跑 3/3、与自身 5 并行 5/5、与重叠的重型用例混跑 28/28 均通过。第 3 轮诊断：`simTime` 冻结在 0.4833 s（29 个固定步）、无暂停原因、`PaintLine.Run` 为真、`AssemblyValid` 为真、渲染约 18 fps——即渲染继续而该页面的固定步不再推进。已在断言消息中加入 `simTickCount`、`logicRunState`、运行时挂接、是否由 DES 驱动和 500 ms 内实际帧数，供 CI 复现时定位；本计划不声称该用例稳定，M4 在远程多轮结果出来前保持未完成。`visual-presentation` 的编码失败与本机内存压力同时出现，同样记录待 CI 观察。

远程 CI：待 PR。

## Rollback

产品修复与用例修复按提交回退；CI 作业删除即恢复原状，不影响其他门禁。

## Outcomes & Retrospective

（完成后填写。）
