---
doc_id: ADR-0001
title: 选择 i18next 多语言运行时与静态目录架构
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-08-20
authority: normative
---

# ADR-0001：选择 i18next 多语言运行时与静态目录架构

## Context

Approved `PS-I18N-001` 要求首批支持 `zh-CN`/`en-US`、默认中文、中文最终回退、用户偏好持久化和 AI 直接翻译。语言偏好属于用户/浏览器状态，不得写入 GLB 或共享项目文档。

当前项目使用 React 19.2、MUI 7.3、TypeScript 5.7 和 Vite 6；UI 同时包含 React 组件、非 React 插件/管理器和多个独立 React Root。仓库没有正式 i18n 依赖，`src/plugins/snap-point/strings.ts` 只是单功能英文字符串表。

2026-08-19 现场查询的候选版本为 i18next 26.3.6、react-i18next 17.0.11 和 react-intl 10.1.22；前两者的 peer 范围覆盖当前 React/TypeScript，实际实施仍必须由 lockfile 固定版本并重新验证。官方资料确认 i18next 可直接绑定静态 `resources`、配置 `fallbackLng` 和类型化资源，react-i18next 提供 Hook/Context 与语言切换能力：

- [i18next configuration options](https://www.i18next.com/overview/configuration-options)
- [i18next fallback](https://www.i18next.com/principles/fallback)
- [i18next TypeScript](https://www.i18next.com/overview/typescript)
- [react-i18next useTranslation](https://react.i18next.com/latest/usetranslation-hook)

## Decision

2026-08-19 接受，批准来源为用户当前明确指令；下列条款自接受起具有规范效力：

1. 使用 `i18next` 作为框架无关核心，使用 `react-i18next` 连接 React；非 React 插件和管理器通过窄封装调用同一实例，不直接依赖 React Context。
2. `zh-CN` **全部 namespace** 随公共构建静态、同步打包，且必须保持完整——它同时是源目录和最终回退，是「任何时候都有可读文本」这一保证的载体。`en-US` 的**启动 namespace**（`common`、`preboot`、`shell`、`viewer`、`plugins`）同样静态打包。

   `en-US` 的**非启动 namespace**（当前为 `projects`、`settings`、`connect`）按 **2026-08-20 修订 R1** 允许异步分包，条件见该修订。任何情况下都不引入 HTTP backend、浏览器语言探测插件或运行时远程目录：分包产物是与主构建同源、同一次构建产出的静态 chunk，不是可配置的翻译服务。
3. `zh-CN` 是默认语言、产品源文案和 `fallbackLng`；英文目录缺 key 时回退中文，中文仍缺失时返回稳定 key 并向可测试的诊断入口报告。「源目录=最终回退」的自洽性依赖源目录不缺 key，因此源目录的建立方向必须明确写死。

   当前事实：`src/` 中尚未发现中文字符，现有 UI 源文案以英文为基准；数量和覆盖范围必须由 `EP-I18N-001` 的可重复盘点脚本产生，不在 ADR 中固化一次性统计。因此首次迁移的方向是：**既有英文原文逐字迁入 `en-US`**，`zh-CN` 由 AI 从既有英文翻译产生并自此成为源目录；迁移完成后新增文案以中文为源，由 AI 生成英文。

   漂移门禁只校验 key 集合、占位符、富文本标记和空值对齐，**禁止对既有英文措辞做回译或批量重写**；确需修改既有英文措辞时必须是独立、可在评审中看到的改动，不得作为目录同步的副作用发生。本条不改变 `PS-I18N-001` 的回退链和翻译责任，也不引入人工翻译或语言复核步骤，只约束首次目录建立的方向，避免「英文 → AI 中文 → AI 回译英文」把上游英文术语、根目录 `doc-*.md`、`docs/images/` 截图和现有测试字面量的共同基准一次性改写。
4. 翻译 key 与显示文本解耦，按领域 namespace 组织；TypeScript 资源类型和严格 key 检查在黄金切片中失败关闭。
5. 用户选择存入版本化 `localStorage` key，并登记到 `rv-storage-keys.ts`；存储不可用或值无效时使用内存态 `zh-CN`，不得污染项目、文档或 GLB。
6. 日期和数字使用浏览器原生 `Intl.DateTimeFormat`/`Intl.NumberFormat` 并显式传入当前 locale；工业单位、信号名称和稳定 ID 不本地化。
7. AI 在开发流程中直接生成并维护 `en-US` 静态目录（首次建立方向见第 3 条：既有英文逐字迁入，不回译重写），不要求人工翻译或语言复核；目录合入前必须通过 key、占位符、标记、空值、漂移和 Browser 行为门禁。
8. 浏览器运行时不得调用 AI 或第三方翻译服务，不得需要翻译令牌，不把网络可用性加入启动和语言切换关键路径。
9. 语言切换的传播契约由核心 i18n 模块定义。现有公开插件契约中的 `label` 字符串形式及已支持的函数/getter 形式必须保持兼容，不得删除、收窄或强制调用方一次性改成 key；可通过新增可选的本地化描述符/key/getter、解析适配层或等价的向后兼容设计逐步迁移。注册表在渲染或 `languageChanged` 后重新解析可本地化文本；把文本烤进 `CanvasTexture` 的世界空间标签在语言切换后必须失效并重建纹理。黄金切片至少覆盖一个非 React 注册标签和一个 CanvasTexture 标签；全量调用点放到后续增量里程碑。
10. 单一 i18next 实例由核心 i18n 模块在 `src/main.ts` 中、早于 `initHMI` **同步**初始化，并通过 `initReactI18next` 注册为默认实例，使 `useTranslation` 在没有 `I18nextProvider` 的情况下同样可用。主 HMI 由 `@rv-private/custom/hmi-entry` 挂载（公共仓库只有 stub），另有多个独立 React Root；语言可用性不得依赖任何单个入口记得包裹 Provider。静态目录下不使用 Suspense（`react: { useSuspense: false }`）。黄金切片验证主 HMI 和至少一个独立 Root；其余 Root 随后按盘点迁移。
11. `index.html` 的 `<html lang>` 与 pre-boot 加载遮罩在 React 挂载前可见，必须由同一次同步初始化读取偏好并更新，避免默认中文产品在启动阶段先显示英文。黄金切片只迁移代表性 Planner/HMI 流程直接使用的 `Intl` 调用和 MUI 内建文案面；全仓 `Intl`/`toLocale*`、MUI locale 和其余 pre-boot 之外的用户可见文本通过后续里程碑按可重复盘点逐批迁移，不扩大第一阶段范围。
12. 中文依赖系统字体，不打包 CJK 字体子集。`src/core/hmi/theme.ts` 的 `typography.fontFamily` 和黄金切片使用的 canvas font 串必须补充明确的 CJK 回退族；没有系统中文字体的精简 Linux/kiosk 镜像属于部署前提，在部署文档中声明。黄金切片验证代表性 React 文本和一个 CanvasTexture 文本不出现缺字方块，全仓字体调用点随增量迁移覆盖。

## Alternatives

### React Intl / FormatJS

优点是 ICU MessageFormat、日期数字组件和消息提取体系完整，也提供 React 与 imperative API。未作为首选，因为当前仓库大量文本位于非 React 插件/管理器，中文静态源目录与 AI 派生目录更适合资源表和 namespace 迁移；React Intl 的 inline `defaultMessage`/提取工作流会增加第一阶段迁移面。若未来复杂复数、性别或 ICU 文案成为主要需求，可用新 ADR 重新评估。

### 自研字符串 Store

可以维持极小依赖并贴合现有 `snap-point/strings.ts`，但需要自行实现 namespace、回退、插值、React 订阅、严格 key 类型和生态工具，长期成本及漂移风险高于采用成熟核心。

### 浏览器运行时 AI 翻译

拒绝。它引入非确定输出、延迟、离线失败、密钥和源文案外发风险，也无法保证同一提交产生可复现界面；与 Approved 产品规格的静态、可测试目录责任冲突。

## Consequences

- 新增两个 MIT 依赖，并增加少量运行时和包体积；实施前后必须记录锁定版本和入口 chunk 变化。
- 同一个 i18next 实例可服务 React Hook、独立 Root 和非 React 插件，但必须由核心 i18n 模块拥有初始化和生命周期，禁止各插件创建隐式实例。
- 静态目录保证离线和确定性，代价是每次中文源文案变化都需要 AI 同步英文并通过漂移检查。
- 第一阶段只迁移黄金切片；KD-001 在全仓增量迁移完成前保持 open。

## Compatibility and Migration

- 新增语言偏好没有旧 Schema 或项目迁移；缺少/损坏偏好值一律回退 `zh-CN`。
- 现有 GLB、rv-ODT、NodeId、项目文档、插件 ID 和工业信号保持不变。
- 现有局部字符串表先由适配层兼容，只有在对应 UI 纳入迁移范围并有回归测试时才移除。
- “Reset all” 必须清除语言偏好；storage registry、清理测试和隐私模式反例同步更新。

## Validation

- dependency license/peer/lockfile 与公共 AGPL build 检查；
- locale 归一化、默认值、无效存储、存储不可用和回退链 Node 测试；
- key 集合、占位符、标记、空值、源目录漂移和 AI 目标目录漂移检查；
- React Hook、非 React `t()`、多个 Root 同步切换的 Browser 测试；
- 默认中文、切换英文、刷新恢复、缺 key、保存/重载项目和 Reset all 黄金切片；
- static、node、browser、build 和入口包体积基线；
- 英文逐字迁入证据：迁移脚本可重复运行，输出 `en-US` 与迁移前源码字面量的逐字比对报告；漂移门禁必须对「回译改写既有英文措辞」这一反例失败（第 3 条）；
- 入口 chunk 预算：实施前从 `tests/bundle-splitting.test.ts` 读取当前预算并记录 `dist/` 实测基线；实施后记录 i18n 运行时和黄金切片同步目录的净增量并证明既有包体积门禁仍通过。未来全量目录分包必须先修订本 ADR（第 2 条）；
- 语言切换传播：一个非 React 注册标签与一个 `CanvasTexture` 烤字标签在 `languageChanged` 后更新的 Browser 测试，并包含「纹理未失效」反例（第 9 条）；
- 测试 locale 固定策略：测试装置必须显式 pin 运行时 locale，不依赖实现默认值；受黄金切片影响的 UI 断言和 e2e 文本定位同步更新，禁止为让门禁通过而放宽或删除断言；
- pre-boot 与 `<html lang>`：首屏（React 挂载前）按已保存偏好语言渲染、`<html lang>` 同步正确的 Browser/E2E 证据（第 11 条）；
- 字体回退：中文默认下代表性 React 文本与一个 CanvasTexture 文本不出现缺字方块的 Browser 证据（第 12 条）；
- **目录分包（R1）**：`zh-CN` 全量仍在入口 chunk；非启动 `en-US` 目录不在入口 chunk 且存在于独立 chunk；入口预算未放宽；English 用户在 React 挂载前已拿到 bundle（无中文中间态）；chunk 取不到时回退中文且记录诊断——每一条都要有对应断言，其中「取不到」必须有注入失败的反例。

## Revisions

### R1（2026-08-20）：允许 `en-US` 非启动 namespace 异步分包

**批准来源**：用户当前明确指令（2026-08-20，「允许」），针对 `EP-I18N-001` 批次 4 之后记录的闸口——入口 chunk 预算 `ENTRY_BUDGET_BYTES = 3_520_000` 仅余 63.3 KB，而受门禁债务尚有 948 处待迁移。

**决定**：只把 `en-US` 的非启动 namespace 移出入口 chunk。`zh-CN` 一条都不动。

这个不对称是本修订的核心，不是省事：第 3 条已经规定 `zh-CN` 是源目录和最终回退，「英文缺 key 时回退中文」是既有契约。让中文始终在场，等于让**任何一种失败都退化成可读的中文，而不是退化成 key**。反过来（把中文也分包）能多省一半体积，但代价是 chunk 取不到时整个面只剩 `settings:tab.backup` 这种字符串——用一个可能在客户机器上出现的、无法自行恢复的状态，换几十 KB，不成立。

第 2 条要求本修订明确的四件事：

- **加载状态**：没有新的加载状态。bundle 在 `main.ts` 的启动序列中、**React 挂载之前**被 `await`；此刻屏幕上是 pre-boot 遮罩（第 11 条），它本来就在等模型。语言切换路径同理：`setLocale('en-US')` 先 `await` bundle 再调用 `changeLanguage`，因此不存在「切到英文后先看到一段中文」的中间态。**不得**为此引入 Suspense（第 10 条仍然有效）或任何面板级的 loading 骨架。
- **失败回退**：取不到 chunk 时不阻塞启动，也不弹错误。受影响的 namespace 走既有回退链落到 `zh-CN`，界面是完整可读的中文；同时向 `reportI18nDiagnostic` 记一条可测试的诊断，使「英文用户看到中文」是可观测的，而不是静悄悄的。
- **离线行为**：chunk 与主构建同源、同一次构建产出，随 `dist/` 一起分发，不需要网络可达任何第三方。首次加载后由 HTTP 缓存/Service Worker 提供；完全离线且未缓存时，行为等同上一条——中文，可用。这一点与第 8 条（浏览器运行时不得依赖网络可用性）一致：英文不是启动关键路径。
- **包体积预算**：`ENTRY_BUDGET_BYTES` 保持 3_520_000 不变，**不因为分包而放宽**——分包的目的是给后续迁移腾出空间，不是给预算松绑。另加一条断言：非启动 `en-US` 目录必须真的不在入口 chunk 里，且必须存在于某个独立 chunk。二者缺一，分包就只是把文件挪了个位置。

**范围限制**：本修订只授权按 namespace 切分 `en-US`。它**不**授权运行时远程目录、按需 HTTP 拉取、语言探测插件，也不授权把 `zh-CN` 移出入口。再扩大边界需要新的修订。

**验证**：见 Validation 一节新增的分包条目。

## Rollback or Supersession

黄金切片可回退到原硬编码文案，同时移除新增偏好 key 和依赖；不涉及项目数据迁移。回退不能删除字符串盘点或 KD-001 证据。未来替换框架必须通过新 ADR，证明目录、key、偏好和回退行为兼容或提供版本化迁移。
