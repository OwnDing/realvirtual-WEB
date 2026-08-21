---
doc_id: EP-I18N-001
title: 建立多语言增量治理与黄金切片
status: approved
plan_status: active
owner: product
last_reviewed: 2026-08-20
authority: normative-process
---

# EP-I18N-001：建立多语言增量治理与黄金切片

## Purpose

先停止新增不可迁移的用户可见文本债务，在已关闭 OD-002 和 Approved `PS-I18N-001` 基础上接受运行时 ADR，最后通过一个可切换、可回退、可保存偏好的端到端黄金切片建立正式 i18n 基座。

## Scope

- 盘点用户可见字符串、动态设备文本、可访问名称和错误消息；
- 建立可复现基线、例外登记和“不得新增散落硬编码文本”的增量门禁；
- 落实 `zh-CN`/`en-US`、默认中文、中文最终回退、AI 直接翻译和 locale 格式化规则；
- 决策完成后建立稳定 key、目录、运行时语言状态和一个代表性 Planner/HMI 流程；
- 验证语言切换、缺失翻译回退、刷新恢复、键盘/触摸和布局溢出。

## Non-goals

- 本计划只在 Accepted `ADR-0001` 划定的边界内按里程碑推进，不授权在可重复盘点与增量门禁建立前批量替换 UI 字符串；
- 不本地化设备、节点、信号、端口或项目稳定 ID；
- 不在浏览器运行时调用 AI；AI 直接翻译的静态目录仍必须通过机器门禁和黄金切片；
- 不在黄金切片验证前覆盖全部 Viewer/HMI/Planner/DES。

## Required Documents and Decisions

- `GOV-CONSTITUTION` UI-1/UI-2、`GOV-CHANGE`、`GOV-DOD`；
- KD-001；
- OD-002 已关闭，Approved `PS-I18N-001` 是产品行为依据；
- 新的长期框架需要 Accepted `ADR-0001`（已于 2026-08-19 接受）；改变用户偏好状态所有权需要另行 Accepted ADR。

## Current Repository Facts

本节记录**当前**仓库事实，随实现推进更新；不是计划创建时的快照。

截至 2026-08-20（批次 12 之后）：

- `PS-I18N-001` 已批准，OD-002 已关闭，`ADR-0001` 已接受。
- i18n 运行时**已存在**：`src/core/i18n/`（单一同步 i18next 实例、locale 归一化、偏好存储、诊断、React 绑定），依赖为 i18next 26.3.6 + react-i18next 17.0.11（锁定于 `package-lock.json`）。
- namespace：`common`、`projects`、`settings`、`shell`、`connect`、`operator`、`authoring`、`assets`、`sim`、`demo`、`tools`、`preboot`、`plugins`、`viewer`；`zh-CN` 为源目录与最终回退，`en-US` 由迁移前源码逐字迁入（`scripts/i18n-verbatim-check.mjs`，当前受检 **2343** 条）。
- 已接入的面：Projects 流程、Settings 面板、常驻 HMI 外壳、CONNECT 工业连接流程、操作员运行时面（机器/维护/历史趋势/传感器/测量/多人/分组/剖切/问题/批注/文档与 3D 悬浮提示）、创作与检查器工作面（层级浏览器/属性检查器/信号编辑/场景文档/脚本编辑器）、资产生命周期（项目创建/素材库/CAD 导入/分享链接）、离散事件仿真与物料流（DES 实验矩阵/仿真工具栏/模式切换/订单清单）、演示 HMI 与存储通知（KPI 条/消息卡片/机器人报警与 AI 助手/图表浮层/浏览器存储横幅/展台导览）、AI 代理管理与布局规划器（代理定义/运行面板/规划器工具栏/素材库面板）、AAS 数据面板、运行时指令与完整信号绑定流程，以及登录门禁、剩余小型插件、加载遮罩、第一人称提示和 WebXR DOM/CanvasTexture 表面。
- 受门禁债务 **92 处 / 30 文件**（`node scripts/i18n-inventory.mjs`），已从 Milestone 1 的 1944 降到不足二十一分之一；`react-copy`、`a11y-name`、`dom-text`、`canvas-texture` 和 `ui-state-text` 均已归零，剩余为 `plugin-registry` 62、`dynamic-text` 14、`pre-boot` 16。建议项 `error-message` 311、`intl-format` 22，其中未显式传 locale 的站点 11。数字必须由脚本产生，不得手抄。
- 入口 chunk 3_460_988 B，预算 `ENTRY_BUDGET_BYTES = 3_520_000`，**余 59_012 B / 57.6 KiB**（`ADR-0001` R1 已把 `en-US` 的 8 个非启动 namespace 移入独立 chunk，当前构建产物 82_101 B；`zh-CN` 全量仍在入口）。批次 12 只增加 2_392 B，因为主要新增英文在 deferred chunk；剩余 92 处按当前密度预计仍可在预算内收尾，但余量已经有限，因此这个决定仍未消失：要么提高 `ENTRY_BUDGET_BYTES`，要么按 `ADR-0001` 第 3 条重新权衡 `zh-CN` 是否仍必须整体留在入口。
- `src/plugins/snap-point/strings.ts` 仍是提取过的局部英文字符串表，按 `ADR-0001` 的适配层路径显式跳过，不计入散落债务。

计划创建时（2026-08-19）的原始事实：仓库没有 i18next、React Intl 或 Lingui 依赖，也没有正式 i18n 契约、运行时目录或语言切换实现；项目使用 React 19.2、TypeScript 5.7。

## State Ownership and Compatibility

语言偏好属于用户/浏览器偏好，不得写成共享项目事实。稳定翻译 key 与中英文展示文本解耦；未知或缺失翻译必须回退，不得破坏已保存项目和插件 API。

## Allowed Paths

计划批准后根据盘点和 ADR 收窄；预计包括 i18n 契约、字符串目录、语言状态、一个黄金切片 UI、测试、验收和文档。

## Forbidden Paths

- GLB/rv-ODT 稳定 ID 与设备/节点/信号/端口身份
- 未经 Accepted ADR 和 Active ExecPlan 授权的框架安装与全仓批量替换
- 真实设备与生产接口

## Milestones

1. 只读盘点、分类规则、基线文件、误报/例外模型和增量门禁设计。
2. 产品/UX 已关闭 OD-002 并批准产品规格；架构评审并接受 i18n 运行时 ADR。
3. 建立目录、语言状态、回退链和一个端到端语言切换黄金切片；保持现有公开插件 `label` 契约向后兼容，并覆盖一个非 React 注册标签、一个 CanvasTexture 标签、pre-boot/`<html lang>`、一个独立 Root，以及代表性的 `Intl`/MUI 文案面。
4. 验证保存恢复、缺失 key、布局/可访问性，再按风险分批迁移其余 Root、`Intl`/MUI、CanvasTexture 和用户可见文本。

## Progress

- [x] 产品确认首批语言为中文、英文，默认语言为中文。
- [x] 产品确认 `zh-CN`/`en-US`、中文最终回退、AI 直接翻译和 locale 格式范围，关闭 OD-002。
- [x] 架构 Owner 评审并接受 `ADR-0001`（2026-08-19）。
- [x] Owner 评审并激活计划（2026-08-19）；计划移入 `active/`，状态改为 `approved`/`active`。
- [x] Milestone 1：可重复盘点脚本、分类规则、基线文件、误报/例外 fixture 与增量门禁（2026-08-19）。
- [x] Milestone 3：i18n 契约、目录、语言状态、回退链与端到端语言切换黄金切片（2026-08-19）。
- [x] Milestone 4a：保存恢复、缺失 key、布局/可访问性与测试 locale 固定策略验证（2026-08-19）。
- [ ] Milestone 4b：按风险分批迁移其余 92 处受门禁文案（批次 1–12 见下方各节）。

## Surprises & Discoveries

Milestone 1 的全部数字由 `npm run i18n:inventory` 产生，schema v1；引用时必须附命令与 schema 版本，不得手抄。

- 受门禁基线为 1944 处、231 个文件：`react-copy` 1514、`a11y-name` 95、`plugin-registry` 133、`dynamic-text` 170、`pre-boot` 20、`dom-text` 10、`canvas-texture` 2。
- `error-message` 324 与 `intl-format` 38（其中 35 处未显式传 locale）**只报告不入门禁**，也不写进基线文件。静态扫描无法区分「用户可见错误」与「内部不变量断言」，把它们纳入门禁会让与 i18n 无关的日常开发失败；一个拦错东西的门禁最后会被关掉。二者的处置放在后续里程碑逐站点分诊。
- `canvas-texture` 只有 2 处字面量，远少于 17 处 `fillText` 调用点：多数调用画的是节点名、测量值等数据。`ADR-0001` 第 9 条的纹理失效要求因此由**表面**而非字面量数量驱动，黄金切片必须显式挑一处世界空间标签来验证，不能等扫描自动指出来。
- `src/` 中文字符数为 0，与 `ADR-0001` 第 3 条「既有英文逐字迁入 `en-US`」的方向前提一致。
- 发现 5 处工业标识被扫描判为文案（Allen-Bradley 控制器系列名、SEW 齿轮电机型号），已按 `PS-I18N-001` §2 / `ADR-0001` 第 6 条附理由登记到 `scripts/i18n-inventory-exceptions.json`；例外必须写理由，且匹配不到任何东西的例外会被守卫测试拒绝。
- 迁移风险：JSX 文案会被内联元素切成多个文本节点（例如 `ProjectCodeConsentDialog.tsx` 把一句话拆成三段）。这类文案不能按节点逐条替换，需要在黄金切片里确定富文本插值的写法。
- `src/plugins/snap-point/strings.ts` 已是提取过的字符串表，扫描按 `ADR-0001` 的适配层路径显式跳过，不计入散落债务。

### 目录分包：`en-US` 非启动 namespace 移出入口 chunk（2026-08-20）

- 用户批准 `ADR-0001` 修订，`R1` 已写入 ADR（含第 2 条要求的四项：加载状态、失败回退、离线行为、包体积预算）。
- **只分 `en-US`，`zh-CN` 一条不动。** 这是本次设计的核心取舍：第 3 条已经把 `zh-CN` 定为源目录兼最终回退，让它始终在场，等于让**任何一种失败都退化成可读中文，而不是退化成 `settings:backup.resetAll` 这种 key**。把中文也分包能多省一倍体积，但换来的是一个可能出现在客户机器上、且用户自己无法恢复的状态——不值。
- 拆分点：`en-US.ts` 只留启动 namespace（`common`/`preboot`/`shell`/`viewer`/`plugins`，16.3 KB），`projects`/`settings`/`connect` 进 `en-US.deferred.ts`（52.8 KB 源码 → 构建产物 **41.0 KB 独立 chunk**）。
- **没有引入任何加载状态**：bundle 在 `main.ts` 里 `await`，位置紧跟 `fetchAppConfig`——此刻屏幕上是 pre-boot 遮罩，本来就在等模型。`setLocale('en-US')` 同样先 `await` 再 `changeLanguage`，所以不存在「切到英文后先闪一段中文」。没有用 Suspense（第 10 条仍然有效）。
- 入口 chunk 3_455_142 → **3_414_725 B**，预算余量 63.3 KB → **102.8 KB**。预算本身没动（`ENTRY_BUDGET_BYTES` 仍是 3_520_000，并加了一条断言钉住它）——分包是为后续迁移腾地方，不是给预算松绑。
- **`ConnectPanel` 没有被改成 lazy。** `tests/bundle-splitting.test.ts` 的 `NON_TARGETS` 里写着「ConnectPanel stays mounted by decision（其用户状态必须在关闭后存活）」，所以「把目录挂到面板 chunk 上」这条路对 `connect` 走不通，只能按 namespace 切。
- **完整套件跑出一个真实缺陷，专项测试没抓到。** 分包后第一次全量运行有 3 个文件失败并输出中文；再跑一次，失败的换成了另外 3 个——随机性说明是竞态而不是某个文件的问题。根因是 `setLocale` 的「已经是这个语言就直接返回」判断排在 `ensureEnglishCatalog()` **之前**：一个**回访的英文用户**，`initI18n` 从存储里读出来就是 `en-US`，`setLocale('en-US')` 什么都不用改于是直接返回，**deferred 目录永远不会被加载**——启动 namespace 是英文，面板是中文。这是生产缺陷，不是测试假象；专项测试永远在「切换语言」，只有全量套件里 localStorage 跨文件存活才复现得出来。已把 ensure 移到判断之前，并在 `initI18n` 里对已是英文的启动路径提前发起请求。回归测试必须**同时**伪造「实例已是英文」和「存储已是英文」才能复现——第一版只做了前者，反例不失败；改正后反例失败。
- 修完连跑两次完整套件：失败集合完全一致（22 文件 / 82 例，全部 WebGL），失败输出中文出现次数为 **0**。
- 新增 `tests/i18n-catalog-split.test.ts`（5 例）与 `tests/i18n-catalog-split-failure.test.ts`（5 例：不抛异常、回退中文而非 key、记录诊断、可重试、不影响启动 namespace）；`bundle-splitting.test.ts` 加 5 条 R1 断言（离开入口 / 确实在某个 chunk 里 / `zh-CN` 仍在入口 / 启动 `en-US` 仍在入口 / 预算未放宽）。
- 反例：把 ensure 挪到 `changeLanguage` 之后 → 分包行为测试失败；把 deferred 目录塞回 `resources` 并重新构建 → T10/T11 失败；模拟 chunk 取不到 → 界面中文、诊断有记录、不抛异常。

### 修正：pre-boot 首屏契约（2026-08-20，外部评审发现）

- **Milestone 3 曾声称 pre-boot 与 `<html lang>` 已满足 `ADR-0001` 第 11 条。该结论是错的，现已更正并修复。**
- 当时的机制是：`index.html` 出英文，`src/main.ts` 在第一个同步 tick 用目录改写。问题在于 `/src/main.ts` 是 **module**，而 module 天生 `defer` —— 它要等 HTML 解析完、3.4 MB 入口 chunk 下载并解析完才会执行。在那之前遮罩已经画在屏幕上了。也就是说：**一个默认中文的产品，每次冷启动都先显示英文再自己改回来**，正是第 11 条点名要避免的那种闪烁。`tests/i18n-preboot.node.test.ts` 当时只守「两份拷贝不漂移」，守不到闪烁本身；它的注释里甚至写着这个症状「在评审和 CI 截图里都看不见」——确实看不见。
- 修复方式是把默认语言放进 shell 本身：`index.html` 的遮罩文案与 `<html lang>` 改为 `zh-CN`，**默认用户在零 JavaScript 的情况下第一帧就是对的**；紧随遮罩之后有一段**内联 classic script**，只在存储偏好为英文时把这五条文案和 `lang` 换成英文。内联同步脚本能在解析期跑到，module 入口不行——这是这次改动的全部要点。
- `main.ts` 的 `applyPrebootText()` 保留，但角色变了：它不再负责首帧，而是「唯一读真实目录的那一遍」，覆盖内联脚本被 CSP 拦掉的情况，并在会话中途 `setLocale` 之后保持遮罩正确。
- 守卫相应加强：现在同时校验 markup（对 `zh-CN`）、内联脚本的英文映射（对 `en-US`）、存储 key 与版本号、`<html lang>` 等于 `DEFAULT_LOCALE`，以及**入口脚本仍是 module 而内联脚本在它之前**——如果哪天有人把内联脚本改成 module，闪烁会立刻回来而其它测试一个都不会响。
- **顺带发现盘点脚本对中文是瞎的**：`NON_PROSE` 的「完全没有字母」规则写成 `/^[^a-zA-Z]*$/`，而 `hasProse` 的字母计数是认 CJK 的——两者互相矛盾，结果**全中文字符串对门禁完全不可见**。把 markup 改成中文后债务从 948 掉到 943，掉的不是还清的债，是看不见的债。已修正为 `/^[^a-zA-Z\u4e00-\u9fff]*$/`，数字回到 948（本次改动对债务是中性的，因为 markup 仍是目录之外的一份拷贝）。这个洞在 `src/` 还没有中文时无害，但 `zh-CN` 成为源语言之后就不是了：硬编码中文和硬编码英文是同一种债，一个看不见产品自身源语言的门禁不算门禁。反例验证过：注入一条硬编码中文文案后基线守卫失败（`react-copy` 670→671）。

### Milestone 4b 批次 12：可见插件与 WebXR 扫尾（2026-08-20）

- 覆盖 15 个插件源文件、37 处受门禁命中：碰撞卡片、文档/历史/测量/剖切/传感器按钮、展台模式、登录门禁、模型开场消息、流程工业着色与储罐历史、第一人称提示、高斯泼溅加载遮罩，以及 WebXR 的 DOM 与 CanvasTexture 表面。全仓 129 → **92**（46 → **30 文件**）；`react-copy`、`a11y-name`、`dom-text`、`canvas-texture` 与 `ui-state-text` 全部归零，`dynamic-text` 16 → **14**。
- WebXR 不只在创建时取一次翻译。插件在 XR 初始化成功后订阅 locale，语言切换会原地刷新 AR 入口/退出/放置按钮与提示，并重绘当前信息面板画布、设置 `CanvasTexture.needsUpdate`；`dispose()` 解除订阅。浏览器回归同时断言 AR 按钮从中文切成英文、纹理 version 递增。
- 登录门禁在主 HMI 挂载前使用独立 React Root；回归证明它不依赖 `I18nextProvider` 也会原地切换。部署方传入的标题、副标题、footer 和模型名仍是数据，不翻译。流程工业介质同理：`RESOURCE_COLORS` 与模型 `resourceName` 保持稳定，只在显示边界用映射解析中文标签。
- FPV 浮层在打开期间订阅 locale；高斯泼溅遮罩改为静态 DOM 骨架 + `textContent` 写入翻译后的标签，文件名不再插入 `innerHTML`。三个真实误报（embed CSS、开场消息的 em dash、WebXR 注入 CSS）和两个无文案 DOM 骨架均附理由登记，例外守卫确认没有悬空条目。
- 验证：`./scripts/verify.sh static` 通过；Node 全套 55 文件 **503** 例通过；受影响 Browser 测试 9 文件 **99** 例通过；`node scripts/i18n-verbatim-check.mjs` 的 **2343** 条值全部追溯到 `d1949a5`；`npm run build` 通过，入口 3_458_596 → **3_460_988 B**（+2_392 B，预算余 **59_012 B / 57.6 KiB**）；`tests/bundle-splitting.test.ts` 14 例通过。完整 Browser 门禁仍受本机无头 Chromium 的 WebGL 上下文耗尽阻塞，未声称全量通过。

### Milestone 4b 批次 11：AAS、运行时指令与信号绑定（2026-08-20）

- 覆盖 10 个受门禁源文件、53 处：AAS 标识解析/属性/文档/购物车，运行时指令卡片与导航，以及信号绑定总览、行内插槽、选择浮层、连接模式、批量动作、首次连接通知和 PLC 右键菜单。全仓 182 → **129**（56 → **46 文件**）。扫描器看不见的表头数组与动态失败原因也一起迁移，避免同一面板出现半中半英。
- AAS 和运行时指令是 React 面，使用 `useRvTranslation`；模块级动作注册表、右键菜单和首次连接通知必须等到**调用/写入边界**再用 `rvT` 解析。这样既不会在 `initI18n()` 前冻结语言，也不用把既有注册契约改宽。回归用例覆盖了组件原地切换，以及模块级标签和通知在调用时读取当前语言。
- 信号名、组件路径、PLC、`CONNECT`、错误码和线上取值保持不变；可读的绑定状态、资格失败原因、方向、动作和通知进目录。`formatStamp` 改为把当前 locale 显式传给日期与时间，未显式 locale 的建议项 12 → **11**。
- **第四处德文残留**出现在首次绑定通知：`Externes Signal verknüpft — interne Steuerung nun nicht mehr aktiv.`。中文与英文都没有可逐字搬运的英文源，因此为新写的 `authoring.signalBind.firstLinkNotice` 登记单点 `GERMAN_SIGNAL_NOTICE` 例外；其余既有英文仍必须逐字追溯。
- **目录 parity 不能证明 key 放在了正确 namespace。** 第一版把 `runtimeInstruction` 同时放进两种语言相邻的 `sim` 分组，两个目录结构完全一致，所以 parity 门禁通过；组件实际请求 `demo:runtimeInstruction.*`，行为测试渲染出裸 key 并失败。已移回 `demo`，并保留中英文原地切换用例钉住真实解析路径。
- 验证：`./scripts/verify.sh static` 通过；Node 全套 55 文件 **503** 例通过；受影响 Browser 测试 11 文件 **121** 例通过；`node scripts/i18n-verbatim-check.mjs` 的 **2277** 条值全部追溯到 `d1949a5`；`npm run build` 通过，入口 3_454_550 → **3_458_596 B**（+4_046 B，预算余 **60.0 KB**），`tests/bundle-splitting.test.ts` 14 例通过。分包测试第一次与 static/Node 并发执行时 T11 扫描延迟 chunk 撞到 15 s 超时；空载原样复跑为 9.7 s 通过，预算 T5 在两次运行中都通过。

### Milestone 4b 批次 10：AI 代理管理与布局规划器（2026-08-20）

- 覆盖 11 个文件、101 处（6874 行）：代理列表/编辑器/运行面板/报告视图，规划器工具栏（网格吸附、磁性吸附、落到表面、链式、文档模式、撤销重做）、素材库面板与选择器、待加载提示。该面归零，全仓 283 → **182**；`tools` namespace 共 **130** 个 key。
- **第三处德文残留**（Milestone 3 在 `LayoutLibraryPanel.tsx`，批次 3 在 `NewsDialog.tsx`，这次在 `PendingLoadMessage.tsx` 与缩略图生成错误）。处理方式与前两次一致：没有可搬运的英文原文，英文是新写的，6 条登记 `GERMAN_PLANNER` 例外。
- **这里我第一次做错又自己抓住**：生成目录时我把德文原文直接填进了 `en-US` 列 —— 逐字迁入检查因此**全绿**（德文确实逐字存在于源码里），但结果是英文用户会看到德文。已改为真英文并登记例外。`tests/i18n-tools.test.tsx` 的第一条用例专门钉这一点：德文必须从**两个**目录里都消失，而不是只在中文那列被翻译。反例验证过：把 `retry` 改回 `Wiederholen` 立刻失败。
- `ComponentAction.tooltip` 按 `ADR-0001` 第 9 条**加宽**为 `string | ((ctx) => string)`（`label` 早就是这个形状）。仍传字符串的插件一行不用改。这条契约由**类型门禁**守，不是运行时用例守 —— 把它改窄回 `string` 会在三处编译失败，而 vitest 剥掉类型后什么都看不见；用例补的是运行时那一半（两种形态都能注册、惰性那个存进去时仍未解析）。
- 代理定义里的 `read-only`、`manual`、`report`、`chat` 和 name slug 是**发给 CONNECT 的线上值**，不进目录；旁边的标签是散文，进。用例用一条否定断言钉住：目录里不允许出现取值为 `read-only` 或 `manual` 的 key。
- **包体积门禁的标记物换了**：`tests/bundle-splitting.test.ts` 用「`Generating preview…` 这条文案只存在于 LayoutLibraryPanel 的实现里」来证明该面板确实被分包了。这条文案现在进了目录，字面量离开了 chunk，门禁随之失败 —— 这是迁移的正确后果，不是回归。标记物改成**翻译 key** `planner.generatingPreview`：key 天生全仓唯一、只存在于解析它的那个实现里，而且**不会被翻译改掉** —— 比任何文案都更适合当标记物。
- `tests/pending-load-message.test.tsx` 原本断言的正是那些德文，已随内容变更改为断言新的英文并补 pin（与批次 3 的 `news-render.test.tsx` 同一处理）。

### Milestone 4b 批次 9：演示 HMI、机器人报警与存储通知（2026-08-20）

- **这一批由用户的实机截图发起**：其余界面已基本中文化，但顶部那条琥珀色横幅仍是英文。定位到 `src/core/storage/rv-opfs-blobs.ts` — 它是**非 React 模块**发出的通知，前八批都在动组件，所以它一直没被碰到。同一张截图里右侧那叠 HMI 卡片也是英文，来自 `src/plugins/demo/**`。批次范围就按截图上看得见的这两层划定。
- 覆盖 17 个文件、87 处：KPI 条与消息卡片、四个图表浮层、驱动/传感器监视、机器人接触力报警与 AI 助手对话框、报警历史、浏览器存储横幅、展台导览。该面归零，全仓 370 → **283**；`demo` namespace 共 **102** 个 key。
- **`SYST_320_SCENARIO` 是这一批最要紧的对象**：一条诊断、五条建议步骤、三条操作员手记，全都是模块加载时构建的散文，而它们正是用户点「ASK AI」后看到的全部内容。改成 getter，所有调用点（`alarm.title`、`alarm.diagnosis`、`alarm.recommendedSteps`…）一行不用改。
- 同一对象里有**必须不动**的三类东西，都写进了用例：报警码 `SYST-320`；`searchTerms` / `excerptSearchTerms` — 它们是拿去检索**英文手册 PDF** 的，译过去就是在一份不含这些词的文档里搜索；以及手册标题 `FANUC CRX Cell Manual — …` — 查不到的引用比读不懂的引用更糟。
- 厂商故障码同理：`F8060`、`MS2N`、`KA47-DRN90M4` 保留，紧挨着的故障描述是散文，翻译。
- `OVERLAY_CATEGORIES` 一开始被我放进了 `demo` namespace，这是**放错了** —— 它是核心「显示」面板的固定目录，不是演示内容。已移到 `operator.groups.cat*`，与该面板其余的 key 待在一起。
- `perf-test-plugin.ts` 的 DOM 覆盖层按例外登记：PASS/FAIL、FPS、三角面数、draw call —— 这是给跑性能基准的人看的工程遥测，不是产品界面，译了反而没法和别的工具对齐。
- **非空洞门禁换了形状，不再是一个每批都要下调的数字。** 上批我把下限从 500 调到 300 时说过绝对下限是错的形状；这批 283 < 300 又撞上了。现在断言的是 `filesScanned > 500` —— 也就是「遍历确实发生了」。这句话在债务归零那天依然成立，而 finding 数下限到那天必须整个删掉，等于**代码库最干净的时候门禁最弱**。反例验证过：把遍历改成空列表，`expected 1 to be greater than 500` 立刻失败。
- 逐字迁入检查补了第五个盲点：拼接片段可能是**双引号**的（`"…external " + 'contact force…'`，句子里有撇号时就会这么写），而空白匹配器的引号类只有 `'` 和 `` ` ``。已加上 `"`。
- 3 个既有浏览器测试按 ADR pin `en-US`。**这次没有做「未 pin」普查**：上批已经记过它看不见带插值的值；这批我试着把阈值放宽到 8 字符并加上 `toBe(`/`toContain(`，结果是 249 条命中、几乎全是数据值而非界面文本。结论写在这里：那个普查只在「DOM 查询 API + 不含插值 + ≥10 字符」这个窄口径下有用，超出就变成噪音，完整套件才是权威。

### Milestone 4b 批次 8：离散事件仿真与物料流（2026-08-20）

- 覆盖 9 个文件、82 处（3378 行）：DES 实验矩阵窗口、DES 工具栏与仿真时钟设置、实时/DES 模式切换、模式切换提示、订单清单插件。该面归零，全仓 452 → **370**；`sim` namespace 共 **103** 个 key。
- **写进磁盘的名字不是文案，因此故意不进目录。** `Baseline` 和 `Experiment N` 由 `createExperiment()` 生成后写入项目清单，并作为运行、检查点、快照的键。把它们翻译，等于让同一个项目在两种语言下产生两套互相看不见的实验——保存在中文界面下的实验，在英文界面里就找不到了。扫描器看不见它们（模板字面量），所以这条只能靠人判断；`tests/i18n-sim.test.tsx` 用一条**否定用例**把它钉住：`sim` namespace 里不允许出现取值为 `Baseline` 或「基线」的 key。反例验证过：加一条 `baselineName` 立刻失败。
- 参数脚本示例 `self.setField('Src','DESSource','InterArrivalTime', 3)` 按例外登记——它是用户要复制进编辑器的**可执行**代码，每个 token 都是 API 表面，译出来就是一段会抛异常的脚本；引出它的那句话则是翻译的，并有用例保证这句话里不会混进 `setField`。
- 领域缩写保持英文（`DES`、`MU`、`LogicSteps`、`KPI`、`CRN`、`DD:HH:MM:SS`），但**成句的技术名翻译**：`Common Random Numbers` → 公共随机数、`Throughput` → 吞吐量。两组用例互为配重。
- `KPI_DEFS`（模块级 KPI 表）改为持 `labelKey`，在构建矩阵行时解析——与批次 6/7 的三张表同型。
- `SimClockSegment` 里的局部状态 `t`（仿真时间）与译函数 `t` 撞名，改名为 `simTime`。这是批次 4 之后第二次遇到：`t` 这个名字现在属于译函数。
- 3 个既有浏览器测试按 ADR pin `en-US`。**普查这次只捞到 1 个**（`ui-lazy-panels`），完整套件又捞到 2 个——其中 `plc-inspector-slot` 断言的是 `signal for {{name}}` 这种**带插值**的 aria-label，而普查按构造就看不见带 `{{}}` 的值。这是该普查的已知边界，记在这里以免下次误以为它是完备的。

### Milestone 4b 批次 7：资产生命周期（2026-08-20）

- 覆盖 16 个文件、135 处（4335 行）：项目创建/重命名/冲突解决与项目导入导出、素材库添加与资产卡、分享对话框与「我的分享」、统一 CAD 导入（对话框、进度块、拖放区、GLB 提供方）。该面归零，全仓 587 → **452**；`assets` namespace 共 **141** 个 key。这一批讲的是一件事：模型怎么进来、怎么出去。
- **文件名和格式名是要打字的东西，而且都在句子中间。** `project.json`、`catalog.json`、`.glb`、`STEP`、`JT`、`USD` 用户要在磁盘上找、要在输入框里敲，因此保持原样；包着它们的句子必须能整体调序。这正是 `<Trans>` 编号占位的用途——把一句话拆成三段 JSX 会把英文语序冻进目录，而中文里 `project.json` 的位置和英文并不一样。本批共 6 处这样的句子。
- **第三方控制台的字段名与另一块屏幕对齐。** Asset Manager 凭据（`Project ID`、`Service Account Key ID`、`Secret Key`）是用户从别人的界面上逐字段抄过来的，放进 `assets.spec.*` 并在两种语言下取值完全相同——与批次 4 的 `connect.spec.*` 同一份约定。同批的 `3Dfindit`、`TraceParts` 是第三方零件库自己的产品名兼链接文字，按例外登记（译名会把用户送去一个不存在的地方），但引出这两个链接的那句话是翻译的。
- 两张模块级表（`RECIPIENT_MODES`、`EXPIRY_LABELS`）改为持 key 而非文本，由单选行在渲染时解析——与批次 6 的 `TYPE_FILTERS`、批次 2 的 `RENDER_MODE_KEY` 同型。
- **两个反例第一次没被抓到，测试因此被加强。** 这一点值得单独记：
  1. 从 `library.urlHint` 里删掉一个 `<0>` 占位——原来的用例只钉了 `project.createHereBody` 一条。改成**扫全 namespace**：任何一条值在两种语言下的占位集合必须完全相同。少一个 `<0>`，整句会退化成纯文本并丢掉组件数组本来要塞进去的元素，而且只在一种语言里发生。
  2. 把 `EXPIRY_LABELS` 里的 `labelKey` 换成另一个 key——表里现在存的是 key，光读目录的断言看不见错配。改成**渲染 ShareDialog 并读那一行单选按钮的文字**。同一条用例顺带也抓住了「把 `{t(o.labelKey)}` 写回 `{o.labelKey}`」。
- `tests/i18n-inventory.node.test.ts` 的非空洞下限从 500 下调到 300：真实债务已经 452。这是该用例注释里写明允许的动作，但补了一句说明它**只是第二道保险**——真正证明扫描器还在工作的是同文件里的分类 fixture，那些在债务归零后依然有效；绝对下限会随迁移推进反复下调，这是设计使然而不是放水。
- 3 条复数拼接登记为 `PLURAL_SPLICE` 例外；受检 `en-US` 值 1715 → **1856**。
- 8 个既有浏览器测试按 ADR pin `en-US`。
- **另外做了一次「未 pin 但断言英文」的普查，而不是每跑一次完整套件才捡出一个。** 做法是取全部 `en-US` 目录值，只保留出现在**文本断言行**（`ByText` / `ByLabelText` / `ByRole(name:)` / `textContent` 等）里的，再排除已 pin 的文件——1202 个测试文件里筛出 5 个，全部补 pin。其中 `aas-resolution-visibility.test.tsx` 值得单独说：它断言的是 `queryByRole({ name: 'Add to Cart' })` **不在文档里**，而按钮现在渲染成「加入购物车」——所以这条用例在中文默认下**一直是绿的，而且是因为错误的原因绿的**。这正是 `ADR-0001` Validation 里 pin 策略要防的那种情况：一条只会因为找不到英文而通过的否定断言，永远不会自己报警。

### Milestone 4b 批次 6：创作与检查器工作面（2026-08-20）

- 覆盖 30 个文件、201 处（13207 行）：层级浏览器与节点行、属性检查器、信号编辑对话框 / 搜索浮层 / 插槽行 / 徽标、组件区与字段行、IK 目标快编、变换对话框、场景文档卡与确认对话框、脚本编辑器与保存流水线。该面归零，全仓 788 → **587**；`authoring` namespace 共 **247** 个 key。这一批是产品的另一半：批次 5 是操作员运行时，这一批是工程师搭建孪生时天天用的那一面。
- **`signal-vocabulary.ts` 不在扫描结果里，但它是这一批最要紧的一个文件。** 它是一张模块级字符串表，存在的理由就是让同一个事实在四个界面上措辞完全一致——所以其中一条被冻住，就是四处同时出错。而我要迁移的 slot-row tooltip 恰恰把它的句子拼进自己的句子里，不一起迁移只会得到半中半英的提示。扫描器看不见元组和模块级常量（批次 3 的 `USE_CASES` 是同一类），因此仍然按「它是不是用户看得见的文案」而不是「扫描器有没有指出来」来决定。
- **`const` 换成 getter，是因为这个模块几乎总是在 `initI18n()` 之前被 import。** 它被信号徽标渲染器传递性引入，一个模块级 `const string` 在那一刻就把当时的语言定死了。`BINDING_STATE_LABEL` / `AUTHORITY_SENTENCE` / `AUTHORITY_CONSEQUENCE` 改成属性 getter，**46 个调用点一个都不用改**（`AUTHORITY_SENTENCE.remote`、`BINDING_STATE_LABEL[state]` 照常工作）；两个裸字符串 `NOT_LINKED_LABEL` / `NOT_LINKED_CELL` 只能改成函数，共 2 个生产调用点。
- 两类「注册表把标签交给稍后渲染的代码」用了**两种不同的解法**，因为它们的重建时机不同：
  1. `TYPE_FILTERS`（层级类型筛选片）在模块加载时构建、此后不再重建 → `label` 改为 `labelKey`，由 chip 在渲染时解析（与批次 2 的 `RENDER_MODE_KEY` 同型）。
  2. `sceneDocumentView()` 的动作菜单每次 publish 都重建 → **不需要**把 `ActiveDocumentVerb.label` 加宽成 `() => string`，只需要给它一个重新 publish 的理由。`installSceneDocumentView` 订阅了 `onLocaleChange`，三行，零契约变更。
- 标识符规则在这一批到处出现，且这次落在编译器上而不只是手册上：`import`/`export`/`exports`、`setup(self)`、`ApiVersion`、`WebComponent`、`Ctrl-S`、`DES`、`IK`、`PLC`、`CONNECT`、`.glb` 全部保持原样，围绕它们的句子翻译。脚本诊断如果把 `setup(self)` 译了，那不是别扭，是**直接错的**——用户照着译文敲出来的东西不会运行。
- 3 处纯标点（`&middot;` 分隔符、`&nbsp;·&nbsp;` 限定符连接）按例外登记而不是塞进目录：它们两边的东西要么是已翻译的计数、要么是节点名这类数据，分隔符本身没有可译内容，放进目录只会诱导后来者把它翻成一个词。
- **一处自己造的缺陷，由完整套件抓到**：批量重命名 `NOT_LINKED_LABEL` → `notLinkedLabel` 的正则为了避开 import 说明符，写了「后面不是 `,` 或 `}` 才补 `()`」——而 `${NOT_LINKED_LABEL} — …` 后面正好是 `}`，于是模板里插进去的是**函数本身**，渲染出 `function notLinkedLabel() {…`。tsc 完全静默（模板插值接受任何类型），只有 `drag-announcer.test.ts` 会响。已修正，并逐个复核了全部 4 个符号的每一个调用点。
- 另一处自己造的、由类型系统当场抓到的：`t('component.signalCount', { count: signalTypeLabel(...) })` 里 `count` 是一个**类型名字符串**而不是数字，i18next 会拿它去选复数分支。已改名为 `{{type}}`。
- 17 个既有浏览器测试按 ADR pin `en-US`（信号插槽、检查器、文档卡、层级、拖拽播报等），125 例恢复通过。
- 受检 `en-US` 值 1468 → **1715**；`operator` 之后新增的 `authoring` 同样进 deferred chunk（`ADR-0001` R1）。
- **两个既有 Node 门禁开始超时，不是断言失败。** 逐字迁入检查 5038 ms、例外注册表扫描 1526 ms，都是「每条目录值 × 每个已迁移文件」的活，每批都更慢。默认 5 秒超时下，一次真实的回归和一次超时长得一模一样——这正是门禁最不该含糊的地方。两处都改成显式 60 s 并写明理由。
- 顺带修了逐字迁入检查的第四个盲点：源码里非 ASCII 字符有**三种写法**——字符本身、HTML 实体、`\uXXXX` 转义。第三种是作者在字符本身不可见时会用的（`\u2014` 表示破折号），于是一条原样搬运的值看起来像是被改写了。反例验证过这不是放水：把 `Showing active fields only` 改成 `Showing consumed fields only` 仍会被指名。

### Milestone 4b 批次 5：操作员运行时面（2026-08-20）

- 覆盖 26 个文件、160 处（7016 行）：10 个 3D 悬浮提示（加工单元 / 泵 / 罐 / 管道 / 驱动 / 指示灯 / WebSensor / 元数据 / 文档 / 信号徽标）与 16 个运行时面板（机器控制、维护引导、历史趋势、传感器历史、测量、多人协同、分组、剖切、问题、批注、PDF 文档、移动端选择表）。该面归零，全仓 948 → **788**；`operator` namespace 共 **201** 个 key。
- 选这一批的理由与批次 3/4 不同：这是**车间操作员真正盯着的那一面**。工程师大多能读英文，站在机器前的操作员未必。
- **产品术语规则在这一批分成两半，这是本批次唯一的判断**：单位与国际通用缩写保持英文（`MTBF`、`MTTR`、`NPSH`、`OEE`、`DN`、`pH`、`ΔP`、`InfluxDB`），普通测量词翻译（`Flow` → 流量、`Level` → 液位、`Vibration` → 振动）。依据是操作员对这两类词的认知方式不同：他认「流量」这两个字，但 `MTBF` 他只认这四个字母——把它译成「平均无故障时间」反而要重新对照。`tests/i18n-operator.test.tsx` 用**两条互为配重的用例**钉住：缩写在两种语言下取值完全相同，普通测量词则必须不同且含中文。只有前一条，一份原样复制的英文目录也能满分。
- `tip.npsh` 是这条规则的形状本身：`NPSH Margin` → `NPSH 裕量`，缩写活下来、旁边的名词没有。写测试时把它错放进「完全相同」那一组，测试当场失败——分类由此才被写准。
- **ISA-101 状态徽标一并翻译，尽管扫描器看不见它。** `MachineControlPanel` 的 `{state}` 是直接渲染的枚举值（`RUNNING`/`IDLE`/…），不在 160 处之内。但面板标题、模式选择器、启停按钮迁移之后，屏幕正中最大的那个词会是唯一剩下的英文。相邻的 `statusLabel()`（`RUN`/`OFF`/`ON`/`ERR`）**保持英文**：那是三字母状态码，与协议名同类。
- 扫描器另有三处看不见的真实文案，一并迁移：`HistorianTrendPanel` 的连接状态三元表达式（`Historian connected` / `Authorization failed` / `Historian unavailable`）、`GroupsOverlay` 的三条复数副标题（`N overlay(s)/filter(s)/group(s)`）、`AnnotationEditModal` 的 `by … — attached to …`。三元赋值给变量、模板串拼复数，任何 JSX 位置规则都命中不了。
- `problems-store.ts` 是本批唯一的非 React 生产者，用 `rvT`（与 `license-store.ts`、`rag-status.ts` 同型）。这里标识符规则再次出现：`assetId` 和 `path` 是**字段名**，句子翻译而字段名不动。**已知限制**：问题条目在模型加载时把文本定死，会话中途切语言不会重写已有条目——下次加载才更新。这属于 `dynamic-text` 类别的既有形态，未在本批次改动 `ProblemEntry` 契约。
- `.join(' and ')` 里藏着一条文案：把两个路径连起来的连接词。中文句子中间冒出一个 ` and ` 不会被任何针对句子本身的断言抓到，因此单独立了 `problems.and` 并单独立了一条用例。
- 顺手清掉本面 3 处 `intl-format` 建议项（`toLocaleString`/`toLocaleTimeString` 显式传 locale），全仓未显式传 locale 的站点 16 → **13**。
- 3 个既有浏览器测试按 ADR pin `en-US`：`badge-tooltip`、`compose-missing-references`、`web-sensor-tooltip-pin`。
- **逐字迁入门禁在本批次被反例证明是「只能证明通过、不能报告失败」的**，已修复。详见下节。

### 修正：逐字迁入门禁在失败时不返回（2026-08-20，本批次反例发现）

- 反例做法照旧：故意改写 4 条已迁移的 `en-US` 值，期望门禁指名它们。**结果是门禁跑了 6 分钟仍未结束**，两次都如此。它不是判错，是**永远给不出答案**——也就是说，任何一次真实的措辞回归都只会把 CI 挂住，而唯一有人观察得到的结果永远是「通过」。此前四个批次的通过结论仍然成立（通过路径 1 秒内返回），失去的是报告失败的能力。
- 三个原因，都在 `verbatimPattern()`：
  1. **首位通配符**。值以 `{{count}}` 开头时，模式以无锚点的惰性 `[\s\S]*?` 起头，每次未命中都要在每个起点上扫到文件尾——单文件 O(n²)，乘以数百个文件就是那 6 分钟。位于**两端**的通配符匹配空串，因此它接受的字符串集合与去掉它完全相同：删掉是等价变换，也是这次真正止血的一处。`{{count}} zone` 这类值在批次 2 就存在了，所以这个洞比本批次更早。
  2. **空白匹配器的回溯**。空格被展开成 `(?:\s|' + '|{' '}|&nbsp;)+`，一个 N 空格的值在近似命中时给引擎指数级的切分方式。改成 JS 的原子组写法 `(?=(X+))\1`，取最长且不再回吐——这本来就是这些候选项的原意。
  3. 加原子组后立刻踩到第二个坑，也是**只有反例才会暴露**的那种：`\2` 后面跟着 `3D`，JS 把 `\23` 读成第 23 个反向引用，再悄悄降级成八进制转义。16 条值因此被误判为新串。反向引用必须包在 `(?:…)` 里。
- 修复后：完整检查 1.1 秒返回；4 条改写值被逐条指名，包括跨越 `—`、括号和数字的那条长句。三处都补了注释说明**为什么**，因为其中两处看起来只是风格问题。

### Milestone 4b 批次 4：CONNECT 工业连接流程（2026-08-20）

- 覆盖 6 个文件、394 处：`ConnectPanel.tsx`（282 处 / 5004 行）、`ConnectOptionsWindow.tsx`、`connect-store.ts`、`rv-connections-section.tsx`、`ConnectUpdateSection.tsx`、`ConnectEmbedGate.tsx`。该面归零，全仓 1342 → **948**；`connect` namespace 新增 **约 330** 个 key。这也是第一次实质性地动 `plugin-registry`（129 → 102）。
- **产品所有者明确确认**：PLC 型号与协议名保持英文，不翻译（与 `PS-I18N-001` §2 / `ADR-0001` 第 6 条一致）。由此确立了本批次贯穿始终的一条规则：**标识符不动，围绕它的句子翻译**。例如能力说明「S7、TwinCAT ADS、OPC UA、Modbus TCP、EtherNet/IP、ctrlX 和 MQTT，以及机器人接口（FANUC、Denso、ABB）。」— 十个协议名原样保留，连接词是中文。
- 该规则在代码里用三种方式钉住，因为它在 diff 里看不见、一年后很容易被「顺手修好」：
  1. `ConnectInterfaceTypeDef.label` **改名为 `productName`**。叫 `label` 会让人以为是漏翻的文案；叫 `productName` 说的就是它本来的意思。网关线上格式仍是 `label`，只在 `fetchInterfaceTypes` 里做一次映射。
  2. 同一结构里 `description` 拆成 **`descriptionKey`（我们的静态注册表）与 `description`（网关自带的散文）**，两者只有一个会被设置。网关的文字是服务端的值，不该由我们编译时翻译。
  3. `connect.spec.*` 分组存放 `AMS NetId`、`DiscardOldest`、`Micro800` 这类厂商/规范术语，两种语言取值**完全相同**，并在目录里写明这是有意为之而非漏翻。反例验证过：把 `AMS NetId` 译成中文，`tests/i18n-connect.test.tsx` 的全量比对立刻失败。
- Milestone 1 登记的 4 条 Allen-Bradley 例外（`ControlLogix / CompactLogix`、`PLC-5`、`SLC 500`、`MicroLogix`）**已删除** — 这些串现在走 `connect.spec.*`，例外守卫会拒绝匹配不到任何东西的条目。
- **逐字迁入门禁第三次补漏**：JSX 里 `<` 和 `>` 必须写成 `&lt;`/`&gt;`（`IO&lt;n&gt;`、`Axes &gt; 0`），而目录里存的是真实字符。加进实体等价表时发现一个顺序陷阱：`<0>` 占位标记本身由尖括号组成，如果先展开实体就会把标记连同它随后变成的 `<[^>]*>` 一起改坏。因此标记先被替换成哨兵，实体展开之后再还原。反例验证过这不是放水 — 把 `VRC symbols` 改写成 `VRC tokens` 仍会被指名。
- 受检 `en-US` 值 839 → **1267**。
- 6 处占位符登记为例外，它们是**示例值而不是文案**：CIP 路由路径 `1,0 (empty for Micro800)`、Keba 浏览根 `SYS, PLC`、Denso 控制器名 `Robot1`、WinCaps 工程路径、SIMIT 共享内存默认名。翻译它们会让用户照抄一个不存在的值。
- 6 个既有浏览器测试补 pin `en-US`；`connect-license-ui.test.tsx` 有两处**读源码文本**的断言（`toContain("label: 'Not connected'")`）随迁移改为断言现在解析的 key — 断言的对象仍是「走中性分支」，不是英文本身。
- 后续批次剩 948 处，最大的几块是 `src/plugins/**`（agents、sim-controller、layout-planner、demo）、`src/core/share`、`src/core/project`、以及 HMI 里的各类领域面板（属性检查器、层级浏览器、信号编辑）。

### Milestone 4b 批次 3：常驻 HMI 外壳（2026-08-20）

- 覆盖 32 个文件：顶栏 / 底栏 / 活动栏 / 相机栏 / 面板框架，以及所有门禁、横幅和全局浮层（欢迎页、许可、AI 桥接同意、模型签名、共享模型信任、密码、项目代码、分析同意、新特性、AI 回答对话框）。该面受门禁命中归零，全仓 1537 → **1342**；`shell` namespace 新增 **235** 个 key。
- 这是第一次实质性地动 `a11y-name` 类别：83 → **58**。这类字符串在截图里看不见、在 diff 里也不显眼，所以新测试专门查了一条 `aria-label` 是否随语言切换。
- **发现 `NewsDialog.tsx` 整个是德文**：`Neu in XYvirtual WEB`、`News schließen`、`Mehr erfahren`、`Weiter`、`Schließen`、`N von M` —— 一个英文产品里的德文遗留面（Milestone 3 在 `LayoutLibraryPanel.tsx` 也遇到过一次德文残留）。这意味着**没有可以逐字搬运的英文原文**：英文是新写的，因此 6 个 key 全部登记进 `NEW_STRING_EXEMPTIONS`（包括那些恰好能在别处匹配到的短词——值得记录的事实是这个对话框从来没有英文，而不是某个三字母按钮标签是否与别的文件撞了）。`tests/news-render.test.tsx` 原本断言的正是这些德文，已随内容变更改为断言新的英文。
- **逐字迁入门禁又漏了一类**：`<Trans>` 的编号占位替换成 `<[^>]*>`，但带属性的 `<Link>`/`<a>` 开标签会**跨行**，其内容从下一行开始，而目录里的句子是平的。因此标记两侧必须吸收空白（`\s*<[^>]*>\s*`）。反例：撤掉这个容错后，`welcome.betaText`、`license.betaNotice`、`license.terms` 三条立刻失败。
- 同一处补了 HTML 实体等价：`&apos;`、`&amp;`、`&mdash;`、`&copy;` 等在渲染后就是对应字符，目录里存的是用户看到的字符。反例验证过这不是放水——把 `Following {{name}}'s view` 改成 `Watching …` 仍然失败。
- 还补了转义序列边界：模板串里的 `\nBranch:` 在**源码文本**中是 `\`、`n`、`B` 三个字符，`n` 与 `B` 之间没有词边界，于是批次 2 加的词锚把它误判为新串。源码级转义序列算作边界。
- 受检 `en-US` 值 604 → **839**。
- 11 个既有浏览器测试因默认语言变化失败，全部按 ADR 显式 pin `en-US`（不放宽、不删除断言），107 例恢复通过。
- `USE_CASES`（欢迎页的 5 组用例）在模块级数组里，扫描器看不见元组，但它是实打实的界面文案，一并迁移；不为此放宽分类规则——数组元组的启发式会带来大量误报。
- 四项不可翻译项登记例外：品牌名 `XYvirtual WEB`、仓库 URL、版权行 `© 2025 realvirtual GmbH`。
- 本批次不含 CONNECT 面（`ConnectPanel.tsx` 282 处等，共 372 处）与 `plugin-registry` 类别（129 处），仍是后续批次。

### Milestone 4b 批次 2：Settings 面板（2026-08-20）

- 覆盖 `SettingsPanel.tsx` + `src/core/hmi/settings/**` 全部 14 个文件（含 `rag-status.ts` 的状态标签）。该面的受门禁命中归零，全仓 1858 → **1537**；`settings` namespace 新增 **458** 个 key。
- **门禁收紧与还债同一次提交**：`hint` 是本仓 `FieldRow`/`SliderRow` 自己的属性，渲染成设置行下方的小灰字，但不在 `COPY_ATTRS` 里。这次把它加进分类规则，暴露出的 19 处全部在本批次内还清——所以门禁数字的移动是「迁移」，不是「重新划线」。反例：临时在 `MouseTab` 加一条硬编码 `hint`，基线守卫失败（`react-copy` 1128→1129）。
- **逐字迁入门禁此前在静默漏检**。`i18n-verbatim-check` 用**叶子名**做 key，而 `section`、`intensity`、`color`、`mode` 这类叶子名在多 namespace 下大量重名——重名不会报错，只会让除最后一条以外的同名值**完全不被检查**。改成按完整点分路径取值后，受检值从 123 条变成 **604** 条。
- 同一处还发现单词级的漏检：值里没有空格时，匹配退化成裸子串，`Low` 会被 `Lower` 匹配、`Linear` 被 `LinearProgress` 匹配、`High` 被 `HighlightStyle` 匹配。加了**条件词边界**（首尾是词字符时才加 `\b`）后，`Linear` 立刻被正确判为新串。
- 匹配器另外承认两种「渲染后就是空白」的 JSX 产物：`{' '}` 和 `&nbsp;`。它们与既有的 `' + '` 拼接缝同类，都是把字符串搬出 JSX 的机械后果，不是措辞变化。
- **复数是这批唯一的新机制，也是唯一的整类风险**。英文把词形变化拼进表达式（`entr${n===1?'y':'ies'}`、`object${n!==1?'s':''}`），中文只有一种形式，两边只能靠 i18next 的 `_one`/`_other` 共存（`zh-CN` 两条写同一句）。代价是：**plural key 在自己的名字下不存在**——`exists('settings:groups.objectCount')` 不带 `count` 返回 false。原来的 `probeLookup` 不转发 options，会把每一条复数文案报成 missing 并渲染成 key。已修正为转发 options；反例验证过：去掉转发后 `tests/i18n-settings.test.tsx` 4 例失败。
- `UISlotEntry.label` 按 `ADR-0001` 第 9 条**加宽而不是替换**为 `string | (() => string)`。插槽在插件构造函数里注册，早于任何语言偏好存在，只有渲染时解析的 getter 能跟随语言切换；仍传字符串的插件一行不用改（测试同时覆盖两种形态）。
- `rv-render-modes.ts` 的 `label`/`description` 保留英文原值给非 UI 调用方，UI 改从目录取。两份同样的字符串必然漂移，因此加了一条守卫测试把二者钉在一起；反例：把 `Shaded` 改成 `Lit` 后该测试失败。
- **批次 1 的验证报告有一处需要更正**：当时称完整 Browser 套件的失败「没有一条涉及译文」。实际上 `tests/scene-name-dialog.test.tsx` 有 3 例是因为 `Scene name` 已在批次 1 迁移、而该文件没有 pin locale 而失败——它当时渲染的是**裸 key**（不含中文），所以被 CJK 计数漏过，混进了 WebGL 那一堆。本次已按 pin 策略修正。
- 由此把 `tests/i18n-test-locale-pin.node.test.ts` 的文本定位器识别范围扩到 `:has-text(`。这是最会藏的一种：CSS 选择器匹配英文文本，文案一变不是抛错而是**匹配不到**，而 `hmi-panels.spec.ts` 写的是「匹配不到就 `test.skip`」——于是测试会安静地停止测试。该 spec 已补 pin，反例验证过守卫会失败。
- 扫描器的三处误报按**改源码**而不是加例外处理：`&nbsp;` 文本节点（改成一句可插值的 `Status: {{value}}`）、`RENDER_MODE_KEY` 的 `label`/`description` 属性（改名 `labelKey`/`descriptionKey`，与本批次其它 key 表一致）。真正不可翻译的 4 项才登记例外（品牌名 `XYvirtual WEB`、双语 `Language / 语言`、示例信号名 `Conveyor.Start …`、与 store 默认值必须一致的 `Browser` 占位符）。
- 顺带清掉本面的 `intl-format` 建议项：19 处 `toLocaleString()`/`toLocaleDateString()` 全部显式传入当前 locale（`ADR-0001` 第 6 条），全仓建议数 38 → 22。
- `RENDER_MODES`、`UISlotEntry` 之外没有触碰任何公共契约；`plugin-registry` 类别（131 处）与 `AiBridgeGate`、`ActivityBar` 等 Settings 面板之外的文案仍是后续批次。

### Milestone 4a/4b 批次 1（2026-08-19）

- 补齐验证：项目清单序列化在中英文下逐字节相同（`modifiedAt` 需固定，否则时间戳会伪装成语言差异）、语言偏好不写入除自身 key 外的任何存储、中英文下头部按钮不被裁切且图标按钮仍有可访问名。
- **测试 locale 固定策略落地**：`e2e/helpers/pin-locale.ts` + `tests/i18n-test-locale-pin.node.test.ts` 强制「断言文本的 e2e spec 必须显式 pin locale」。发现 `connect-embed-e2e.spec.ts` 断言的 `Retry` 正是已迁移的 pre-boot 按钮——默认中文下会渲染成「重试」，属于真实断裂而非预防性改动。另有 3 个 spec 补 pin。
- 迁移批次 1 覆盖 Projects 流程剩余部分（`src/core/hmi/projects/**` 全部 + `ConfirmActionDialog`），受门禁债务 1904 → **1858**。5 个既有浏览器测试因默认语言变化而失败，按 ADR 要求**显式 pin `en-US`**（不放宽、不删除断言），123 例恢复通过。
- 被内联元素切碎的文案（`A workspace is one folder … <code>project.json</code> shows up here.`）用 `<Trans>` 的编号占位 `<0>` 合并成**一个** key。拆成三段 JSX 会把英文语序冻结进目录，翻译无法调整。
- 扫描器发现自己把 `src/core/i18n/catalogs/**` 当成散落债务（目录里的 `title:`/`message:` 命中注册属性规则）。目录是提取产物，已显式跳过——否则每加一条翻译，"债务"反而增加。
- 逐字迁入门禁补了两类机械差异：`<Trans>` 的 `<0>` 标记，以及源码里跨行的字符串拼接缝（`' + '` 与反引号缝）。措辞改写仍会失败——反例验证过。

### Milestone 3（2026-08-19）

- 黄金切片为 Projects Dashboard（`ProjectsDashboardHost.tsx`），该文件受门禁命中已归零；全仓受门禁债务 1971 → **1904**（`npm run i18n:inventory`，schema v2）。
- 扫描器补了 `ui-state-text` 规则：`setMessage(...)` 这类把文案交给渲染型状态设置器的调用，任何 JSX 位置规则都看不见，而黄金切片里就有 12 处。补规则时顺带发现 `LayoutLibraryPanel.tsx` 有一条**德文**残留文案。
- `context-menu-store` 的 `label: string | ((target) => string)` 契约本就在菜单打开时解析，所以非 React 注册标签用**函数形式**即可随语言切换，`ADR-0001` 第 9 条不需要任何契约变更，仍传字符串的插件一行不用改。
- CanvasTexture 重绘只对**目录来源**的标签生效：带 `ErrorText` 的徽标是模型内容而非界面文案，重绘会静默改写模型自己的报错。重绘保持原画布尺寸并按需缩字号，因为 sprite 的世界缩放是按首次 aspect 算的。
- 浏览器反例暴露出一个真实缺陷：`clearAllRVStorage()` 清了键，但偏好模块的内存回退值仍在应答，导致「Reset all」后语言并未真正重置。已修正为「存储可读时以存储为准，内存只在存储不可读时兜底」。
- i18next 的 `parseMissingKeyHandler` 只拿到**裸 key**，截图里的 `noSuchKey` 远不如 `viewer:noSuchKey` 可定位，因此缺失路径由本仓自己的 `probeLookup` 返回带 namespace 的 key。
- i18next v23 起 `initImmediate` 改名为 `initAsync`（语义反转）；同步初始化必须写 `initAsync: false`，否则首帧可能读不到目录。

## Decision Log

- 2026-08-18：治理评审只批准建立 Proposed 计划；OD-002 仍为 open，不据此选择实现方案。
- 2026-08-19：用户当前明确指令确认首批语言为中文、英文，默认语言为中文；计划仍保持 Proposed，未选择 locale 标识、回退链、翻译责任或 i18n 框架。
- 2026-08-19：用户明确由 AI 直接完成翻译并确认进入下一步；采用 `zh-CN`/`en-US`、中文最终回退和 locale 格式化方案，OD-002 关闭，建立 Proposed `ADR-0001` 评审运行时框架。
- 2026-08-19：吸收外部评审中关于首次目录迁移、非 React/Canvas 传播、pre-boot、多个 Root、测试 locale、包体积和 CJK 字体的候选设计；修正异步分包与同步启动冲突，保留公开插件 `label` 契约兼容，并把全量盘点移到后续增量里程碑。该评审不构成 ADR 接受或计划激活。
- 2026-08-19：Owner 接受 `ADR-0001` 并激活本计划，批准来源为用户当前明确指令。计划移入 `active/`，frontmatter 改为 `status: approved, plan_status: active, authority: normative-process`。执行范围限于 ADR 划定的黄金切片边界：非启动 namespace 的异步分包、全仓 Root、`Intl`/MUI、CanvasTexture 与其余用户可见文本仍属后续增量里程碑，扩大范围需要 ADR 修订或新的里程碑决定。依赖安装与锁文件变更放在 Milestone 1 的盘点和门禁设计之后，并按 Validation 逐项留证。

## Reproducible Inventory

计划激活时先用下列只读命令定位候选面；命令输出只用于发现，不直接作为用户可见字符串总数或完成率：

```bash
rg -l -P '[\x{4e00}-\x{9fff}]' src --glob '*.{ts,tsx,js,jsx,json,html,css}'
rg -n 'ctx\.fillText|\.fillText\(' src --glob '*.{ts,tsx}'
rg -n 'Intl\.|toLocale[A-Za-z]*\(' src --glob '*.{ts,tsx}'
rg -n "['\"]en-US['\"]" src --glob '*.{ts,tsx}'
```

Milestone 1 已交付版本化盘点脚本，上述 `rg` 命令此后只用于临时定位，不作为数字来源：

| 产物 | 路径 | 职责 |
| --- | --- | --- |
| 盘点脚本 | `scripts/i18n-inventory.mjs` | 基于 TypeScript AST 的分类扫描；`--json` 输出全部命中，`--write` 刷新基线 |
| 类型声明 | `scripts/i18n-inventory.d.mts` | 供 `tests/` 以类型安全方式导入 |
| 基线 | `tests/i18n-inventory-baseline.json` | 生成物，只含受门禁类别的分类别与分文件计数 |
| 例外登记 | `scripts/i18n-inventory-exceptions.json` | 手工维护的误报与不可本地化项，每条必须写理由 |
| 门禁与分类 fixture | `tests/i18n-inventory.node.test.ts`、`tests/fixtures/i18n-inventory/` | 基线漂移守卫 + 正例/反例分类规则 fixture |
| i18n 运行时 | `src/core/i18n/` | 单实例、locale 归一化、偏好存储、诊断、React 绑定与目录 |
| 逐字迁入门禁 | `scripts/i18n-verbatim-check.mjs`、`tests/i18n-preboot.node.test.ts` | 证明 `en-US` 每条值都能逐字追溯到迁移前源码 |

门禁语义：基线**双向**比对。数字变大＝新增散落硬编码文本，违反 `GOV-CONSTITUTION` UI-1，必须改走 i18n 入口或附理由登记例外；数字变小＝迁移落地，用 `node scripts/i18n-inventory.mjs --write` 刷新基线。刷新只有一条命令，正是为了让人没有理由去放宽分类规则——分类规则才是此处的契约。

## Validation

Milestone 1 已验证（2026-08-19，本地）：`npm run lint` 通过；`tsc -p tsconfig.json --noEmit` 干净；`npm run test:node` 通过（含本门禁 10 例）；`./scripts/verify.sh governance` 通过。门禁非空洞性由反例证明：临时在 `src/` 放入一个含硬编码文案的组件后，守卫测试失败并给出分类别增量（`react-copy` 1514→1515、`a11y-name` 95→96），移除后恢复通过。

Milestone 3 已验证（2026-08-19，本地）：

| 项 | 结果 |
| --- | --- |
| `./scripts/verify.sh static`（governance + ESLint 边界 + 社区 tsc） | 通过 |
| `npm run test:node` | 54 文件 **497** 用例通过（新增 i18n runtime/catalog/preboot 共 27 例） |
| `npx vitest run tests/i18n-golden-slice.test.tsx` | **11 例通过**（多 Root 同步、非 React `t()`、纹理重绘、缺字检测、Reset all） |
| `npm run build` | 通过 |
| 入口 chunk | 3_287_254 → **3_348_520 B**，净增 **59.8 KB**；预算 `ENTRY_BUDGET_BYTES = 3_520_000` 仍余 **167.5 KB** |
| `node scripts/i18n-verbatim-check.mjs` | 88 条 `en-US` 值全部逐字追溯到 `d1949a5` |
| 严格 key 反例 | `rvT('projects', 'nav.doesNotExist')` 编译失败（TS2345），符合 `ADR-0001` 第 4 条失败关闭 |
| 漂移反例 | 把一条英文改写成回译腔后 `i18n-verbatim-check` 失败并指名该 key |
| 纹理反例 | 带模型自有 `ErrorText` 的徽标在切换语言后像素不变；目录来源徽标重绘且 `texture.version` 递增 |

Milestone 4 已验证（2026-08-19，本地）：`./scripts/verify.sh static` 通过；`npm run test:node` 55 文件 **500** 例通过；Projects 相关浏览器测试 23 文件 **483** 例通过；`tests/i18n-golden-slice.test.tsx` **13** 例通过；`npm run build` 通过，入口 chunk 3_287_254 → **3_351_984 B**（净增 **64.7 KB**，预算余 **168.0 KB**）；`node scripts/i18n-verbatim-check.mjs` **123** 条值全部逐字追溯。

**未通过项（必须披露）**：完整浏览器套件 `npm test` 本机 950 文件中 25 文件 / 80 用例失败，绝大多数为 `THREE.WebGLRenderer: Error creating WebGL context.`（本机 SwiftShader 无法创建 WebGL 上下文，隔离运行同样失败）。当时声称「没有一条失败涉及译文」，依据是失败信息中中文出现次数为 0；**该结论在批次 2 被证伪并已更正**——`tests/scene-name-dialog.test.tsx` 的 3 例正是批次 1 迁移的 `Scene name` 未 pin locale 导致，只因当时渲染的是裸 key 而非中文才躲过了 CJK 计数。受本次改动影响的 UI 测试单独运行 7 文件 64 例全部通过。完整浏览器门禁需要在可用 GPU 的环境重跑后才能声称通过。

Milestone 4b 批次 2 已验证（2026-08-20，本地）：

| 项 | 结果 |
| --- | --- |
| `./scripts/verify.sh static`（governance + ESLint 边界 + 社区 tsc） | 通过（exit 0） |
| `npm run test:node` | 55 文件 **500** 例通过 |
| `npx vitest run tests/i18n-settings.test.tsx` | **8 例通过**（默认中文、原地切换不重挂、无未解析 key、复数全量扫描、插件 getter 标签、渲染模式漂移、RAG 标签） |
| 受影响 Browser 测试单独运行 | 12 文件 **165** 例通过 |
| `npm run build` | 通过 |
| 入口 chunk | 3_351_984 → **3_386_379 B**，净增 **33.6 KB**（458 key × 2 语言）；预算 `ENTRY_BUDGET_BYTES = 3_520_000` 仍余 **130.5 KB**，`tests/bundle-splitting.test.ts` 9 例通过 |
| `node scripts/i18n-inventory.mjs` | 受门禁 1858 → **1537**（202 文件）；Settings 面归零；建议项 `intl-format` 38 → 22 |
| `node scripts/i18n-verbatim-check.mjs` | **604** 条 `en-US` 值全部逐字追溯到 `d1949a5`（按完整路径取值，此前按叶子名只检了 123 条） |

反例（证明门禁非空洞）：

| 注入的缺陷 | 失败的门禁 |
| --- | --- |
| `probeLookup` 不转发 options | `tests/i18n-settings.test.tsx` 4 例失败（复数文案渲染成 key 并被报 missing） |
| 改写既有英文措辞（`resetAllHint`） | `i18n-verbatim-check` 指名该 key 失败 |
| 新增一条硬编码 `hint=` | `tests/i18n-inventory.node.test.ts` 基线漂移失败（`react-copy` 1128→1129） |
| 把 `RENDER_MODES` 的 `Shaded` 改成 `Lit` | `tests/i18n-settings.test.tsx` 漂移守卫失败 |
| 去掉 `hmi-panels.spec.ts` 的 pin | `tests/i18n-test-locale-pin.node.test.ts` 指名该 spec 失败 |

Milestone 4b 批次 3 已验证（2026-08-20，本地）：

| 项 | 结果 |
| --- | --- |
| `./scripts/verify.sh static` | 通过（exit 0） |
| `npm run test:node` | 55 文件 **500** 例通过 |
| `npx vitest run tests/i18n-shell.test.tsx` | **5 例通过**（aria-label 随切换、类组件用 `rvT`、模块级表在调用时解析、独立 Root 无 Provider、235 key 全量扫描） |
| 受影响 Browser 测试单独运行 | 11 文件 **107** 例通过 |
| `npm run build` | 通过 |
| 入口 chunk | 3_386_379 → **3_418_493 B**，净增 **31.4 KB**（235 key × 2 语言）；预算余 **99.1 KB**，`tests/bundle-splitting.test.ts` 9 例通过 |
| `node scripts/i18n-inventory.mjs` | 受门禁 1537 → **1342**（170 文件）；`a11y-name` 83 → 58 |
| `node scripts/i18n-verbatim-check.mjs` | **839** 条值全部逐字追溯 |
| 完整 `npm test` | 951 文件 **10,298** 例通过；失败 22 文件 / 82 例，与批次 3 之前的本机基线逐条一致 |

反例：撤掉 `<Trans>` 标记的空白容错 → 3 条跨行 `<Link>` 文案失败；改写 `shell.bar.followPart` → 指名失败；改写含 `&apos;` 的 `sharedView.following` → 指名失败；从 `en-US` 删掉一个 key → `tests/i18n-shell.test.tsx` 与目录 parity 测试失败。

Milestone 4b 批次 4 已验证（2026-08-20，本地）：

| 项 | 结果 |
| --- | --- |
| `./scripts/verify.sh static` | 通过（exit 0） |
| `npm run test:node` | 55 文件 **500** 例通过 |
| `npx vitest run tests/i18n-connect.test.tsx` | **7 例通过**（spec 术语两语言一致、`productName` 而非 `label`、名称不动而描述随语言变、描述来源二选一、opener 切换、协议名在中文句子里保持英文、约 330 key 全量扫描） |
| 受影响 Browser 测试单独运行 | 6 文件通过（`connect-license-ui` 16 例等） |
| `npm run build` | 通过 |
| 入口 chunk | 3_418_493 → **3_455_142 B**，净增 **35.8 KB**；预算余 **63.3 KB**，`tests/bundle-splitting.test.ts` 9 例通过 |
| `node scripts/i18n-inventory.mjs` | 受门禁 1342 → **948**（164 文件）；`plugin-registry` 129 → 102 |
| `node scripts/i18n-verbatim-check.mjs` | **1267** 条值全部逐字追溯 |
| 完整 `npm test` | 953 文件 **10,305** 例通过；失败 22 文件 / 82 例，与批次 4 之前的本机基线**逐文件一致** |

**关于失败数字**：该计数**每次运行都会变**。失败根因是无头 Chromium 的 WebGL 上下文耗尽，能创建多少个上下文取决于机器负载和用例执行顺序，因此同一份代码在不同机器/不同次运行会得到不同的文件数与用例数（本机 22/82，外部评审同期跑出 27/87）。稳定的不是数字，而是三条不变量：**失败文件全部集中在需要 WebGL 上下文的那一组**、**失败信息中中文出现次数为 0**、**i18n 专项套件单独运行全绿**。引用本行时请引用这三条，不要把某一次的数字当成事实。

反例：把 `AMS NetId` 译成中文 → spec 全量比对失败；把 `label` 加回类型定义 → 注册表守卫失败；把 `VRC symbols` 改写成 `VRC tokens` → 逐字门禁指名失败。

**入口包体积提醒**：累计净增已达 165.5 KB，预算 `ENTRY_BUDGET_BYTES = 3_520_000` 仅余 **63.3 KB**。剩余 948 处债务若按当前密度全部迁入静态目录，很可能撞上预算 —— `ADR-0001` 第 2 条要求非启动 namespace 的异步分包必须先修订 ADR。**这是后续批次开始前必须处理的闸口，不能等到构建失败才发现。**

**未通过项（必须披露）**：完整浏览器套件 `npm test` 本机 951 文件中 **22 文件 / 82 用例**失败，逐条核对均根因于 `THREE.WebGLRenderer: Error creating WebGL context.`（78 例直接报此错，1 例 `embed-boot` 超时与 1 例 `dispose` TypeError 是同一渲染器创建失败的下游）。失败输出中中文出现次数为 **0**，且已逐文件核对无一与本批次相关。完整浏览器门禁仍需在可用 GPU 的环境重跑后才能声称通过。

后续里程碑至少仍需要 governance、static、focused Node/Browser、build、入口包体积和语言切换行为验证。黄金切片的测试装置必须显式 pin locale，并验证公开插件 `label` 的既有字符串与函数/getter 形式兼容、同步初始化/离线切换、非 React 标签、CanvasTexture 重建、pre-boot/`<html lang>` 与一个独立 Root；全量盘点项不作为第一阶段完成条件。

### Decision Log — 批次 4

- 2026-08-20：用户明确确认「PLC 型号与协议名不需要翻译成中文，保持英文就行」，与 `PS-I18N-001` §2 / `ADR-0001` 第 6 条一致。据此在 `ConnectInterfaceTypeDef` 上把 `label` 改名为 `productName`、拆出 `descriptionKey`，并建立 `connect.spec.*` 分组。这三处是内部类型与目录结构调整，不改变网关线上格式，不需要新 ADR。
- 2026-08-20：入口 chunk 预算余量降至 63.3 KB。后续批次开始前必须先就「非启动 namespace 异步分包」做 ADR 修订决定（`ADR-0001` 第 2 条），否则继续迁移会撞预算。此闸口记录在此，不由 Agent 自行拍板。

### Decision Log — 批次 3

- 2026-08-20：用户选择「常驻 HMI 外壳」作为批次 3（在 CONNECT 工业连接流程与外壳之间二选一）。理由是见效最快：项目与设置已中文化后，中文用户仍然每次开机就看到英文顶栏。CONNECT 面（372 处，含大量 PLC 型号与协议名）与 `plugin-registry` 全类别推迟到后续批次，本批次不扩大范围。

### Decision Log — 批次 2

- 2026-08-20：用户明确指令继续 Milestone 4b，指定 Settings 面板为下一批。范围限于 `SettingsPanel.tsx` + `src/core/hmi/settings/**`；`UISlotEntry.label` 的向后兼容加宽依 `ADR-0001` 第 9 条授权，未新增 ADR。`rv-render-modes.ts` 的注册标签、`AiBridgeGate`/`ActivityBar` 等面板外文案，以及 `plugin-registry` 全类别仍属后续批次，本批次不扩大范围。

## Rollback

基线门禁可以回退但不得丢失债务记录；运行时黄金切片必须说明用户偏好和目录的向前/向后兼容方案。

## Outcomes & Retrospective

仅在交付后填写；激活不代表实现承诺或能力完成。
