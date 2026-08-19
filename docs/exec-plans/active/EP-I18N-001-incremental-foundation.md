---
doc_id: EP-I18N-001
title: 建立多语言增量治理与黄金切片
status: approved
plan_status: active
owner: product
last_reviewed: 2026-08-19
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

- `PS-I18N-001` 已批准，OD-002 已关闭；当前仍没有正式 i18n 契约、运行时目录或语言切换实现；
- 现有文本盘点数字必须在计划激活时由脚本重新产生，不从外部评审复制为当前事实。
- `src/plugins/snap-point/strings.ts` 存在仅含英文的轻量字符串表，但不是正式全局 i18n 运行时或 Approved 契约。
- 2026-08-19 现场查询：项目使用 React 19.2、TypeScript 5.7；仓库没有 i18next、React Intl 或 Lingui 依赖。

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
- [ ] Milestone 4b：按风险分批迁移其余 1858 处受门禁文案（批次 1 已交付：Projects 流程）。

## Surprises & Discoveries

Milestone 1 的全部数字由 `npm run i18n:inventory` 产生，schema v1；引用时必须附命令与 schema 版本，不得手抄。

- 受门禁基线为 1944 处、231 个文件：`react-copy` 1514、`a11y-name` 95、`plugin-registry` 133、`dynamic-text` 170、`pre-boot` 20、`dom-text` 10、`canvas-texture` 2。
- `error-message` 324 与 `intl-format` 38（其中 35 处未显式传 locale）**只报告不入门禁**，也不写进基线文件。静态扫描无法区分「用户可见错误」与「内部不变量断言」，把它们纳入门禁会让与 i18n 无关的日常开发失败；一个拦错东西的门禁最后会被关掉。二者的处置放在后续里程碑逐站点分诊。
- `canvas-texture` 只有 2 处字面量，远少于 17 处 `fillText` 调用点：多数调用画的是节点名、测量值等数据。`ADR-0001` 第 9 条的纹理失效要求因此由**表面**而非字面量数量驱动，黄金切片必须显式挑一处世界空间标签来验证，不能等扫描自动指出来。
- `src/` 中文字符数为 0，与 `ADR-0001` 第 3 条「既有英文逐字迁入 `en-US`」的方向前提一致。
- 发现 5 处工业标识被扫描判为文案（Allen-Bradley 控制器系列名、SEW 齿轮电机型号），已按 `PS-I18N-001` §2 / `ADR-0001` 第 6 条附理由登记到 `scripts/i18n-inventory-exceptions.json`；例外必须写理由，且匹配不到任何东西的例外会被守卫测试拒绝。
- 迁移风险：JSX 文案会被内联元素切成多个文本节点（例如 `ProjectCodeConsentDialog.tsx` 把一句话拆成三段）。这类文案不能按节点逐条替换，需要在黄金切片里确定富文本插值的写法。
- `src/plugins/snap-point/strings.ts` 已是提取过的字符串表，扫描按 `ADR-0001` 的适配层路径显式跳过，不计入散落债务。

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

**未通过项（必须披露）**：完整浏览器套件 `npm test` 本机 950 文件中 25 文件 / 80 用例失败，全部为 `THREE.WebGLRenderer: Error creating WebGL context.`（本机 SwiftShader 无法创建 WebGL 上下文，隔离运行同样失败），**没有一条失败涉及译文**（失败信息中中文出现次数为 0）。受本次改动影响的 UI 测试单独运行 7 文件 64 例全部通过。完整浏览器门禁需要在可用 GPU 的环境重跑后才能声称通过。

后续里程碑至少仍需要 governance、static、focused Node/Browser、build、入口包体积和语言切换行为验证。黄金切片的测试装置必须显式 pin locale，并验证公开插件 `label` 的既有字符串与函数/getter 形式兼容、同步初始化/离线切换、非 React 标签、CanvasTexture 重建、pre-boot/`<html lang>` 与一个独立 Root；全量盘点项不作为第一阶段完成条件。

## Rollback

基线门禁可以回退但不得丢失债务记录；运行时黄金切片必须说明用户偏好和目录的向前/向后兼容方案。

## Outcomes & Retrospective

仅在交付后填写；激活不代表实现承诺或能力完成。
