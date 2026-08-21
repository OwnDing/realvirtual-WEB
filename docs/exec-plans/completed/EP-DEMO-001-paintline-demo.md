---
doc_id: EP-DEMO-001
title: 涂装线 3D 演示场景（黄金切片）
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-22
authority: normative-process
---

# EP-DEMO-001：涂装线 3D 演示场景（黄金切片）

## Purpose

交付一个浏览器内可运行的**连续输送式涂装线**演示场景：一条闭合悬挂链带动挂具匀速循环，依次穿过前处理、烘干、喷涂、冷却四个工艺段；喷房内的喷涂机构往复运动，工件通过喷房后改变颜色；配套一段分段讲解的 Kiosk Tour（中英双语字幕 + 镜头脚本），复刻参考动画的叙事节奏。

用户可观察到的成功标准：

1. 在 Layout Planner 的库目录中出现 `Paint Line` 分类，可拖放其中每一个对象。
2. 加载 `DemoPaintLine.glb` 后，无需任何手动操作，挂具沿闭环持续推进，姿态始终竖直向下（不翻滚、无 NaN）。
3. 工件驶出喷房后颜色由本色变为漆色，驶回上件位后复位。
4. 点击进入 Kiosk 模式后，镜头自动依次推近四个工艺段，每段弹出对应字幕；切换界面语言后字幕同步切换。
5. 场景保存后重新载入，布局、链速、挂具相位可复现。

## Scope

- 新增一个 Node 端参数化 GLB 生成器，产出 7 个涂装线库对象至 `public/library/PaintLine/`。
- 用 Layout Planner 拼装并保存成品场景 `public/scenes/DemoPaintLine.glb`，登记进 `public/scenes/index.json`。
- 新增按 GLB 文件名自动绑定的 model plugin pack `src/plugins/models/DemoPaintLine/`，承载喷涂运动、工件变色、Kiosk Tour。
- 新增中英文 i18n 词条（仅新增 key）。
- 新增对应的 Node 单测与 Playwright 场景。

## Non-goals

本次**不做**下列内容，避免任务扩张：

- **不新增、不修改任何库行为**（`src/behaviors/**` 属于 Forbidden Paths）。喷涂运动与工件变色是 demo 层插件代码，不是可复用组件契约。
- **不改动 `schema/v1/**`**。新增能力全部走既有命名约定与 `rv_extras` 载荷，rv-ODT 契约零变更。
- **不做积放式缓冲（power-and-free）**。参考动画中的蛇形储存段依赖每载具独立行进与间距钳制，`src/behaviors/OverheadConveyor.ts` 模块注释明确将其列为未实现的 follow-up。
- **不承诺 DES 模式**。同一注释说明该组件刻意不带 `des` 块，刚性循环链在 DES 场景中不推进；v1 只承诺连续（60 Hz）模式。
- **不接 PLC / 真实信号源**。组件自带的 `OverheadConveyor.Run/.Moving/.Position` 信号会被声明，但本次不连任何外部工业接口。
- **不复刻参考动画的品牌、logo 与具体机型**。参考素材是第三方厂商（TAKUBO）的商业宣传动画；本计划复刻的是公开的涂装工艺流程与镜头叙事结构，几何全部自建。

## Required Documents and Decisions

- [`../../governance/DEVELOPMENT_CONSTITUTION.md`](../../governance/DEVELOPMENT_CONSTITUTION.md)
- [`../../governance/AI_SAFETY.md`](../../governance/AI_SAFETY.md)
- [`../../governance/CHANGE_MANAGEMENT.md`](../../governance/CHANGE_MANAGEMENT.md) §6 黄金切片
- [`../../governance/DEFINITION_OF_DONE.md`](../../governance/DEFINITION_OF_DONE.md)
- [`../../LEGACY_DOCUMENT_REGISTER.md`](../../LEGACY_DOCUMENT_REGISTER.md) 路由到的 `doc-layout-planner.md`、`doc-behavior-modelling.md`、`doc-persistence.md`
- `schema/v1/specification.md` §7a.34 `Path`（只读取，不修改）

**不需要 ADR**：本次不改技术栈、模块边界、状态所有权、身份模型或任何已发布契约，全部为新增文件。若后续 M4 实施积放缓冲（需改 `OverheadConveyor` 的状态模型，从单一链相位标量改为每载具行进者），届时必须先提 ADR。

## Current Repository Facts

开始时分支 `develop`，工作树干净。以下事实经代码核对，非记忆：

**可复用**

| 事实 | 位置 |
| --- | --- |
| 悬挂链组件已存在：单一 `s_chain` 标量驱动闭合 `RVPath` 上 N 个载具，重力定向（仅偏航取自切线，不做 Frenet 翻滚） | `src/behaviors/OverheadConveyor.ts` |
| 载具按命名约定发现，正则 `^Carrier(-.*)?([_ ]?\(\d+\))?$`，DFS 顺序即间距索引 | `src/core/library-component-loader.ts:64` |
| 行为匹配的是 **GLB 文件名**（去掉 `.glb`），或场景内已放置 LayoutObject 的资产名（去掉 `_N` 后缀）；`OverheadConveyor` 的匹配模式是 `*OverheadConveyor*` | `src/core/behaviors.ts:14`、`src/behaviors/OverheadConveyor.ts` |
| 库对象逻辑全部由节点命名约定驱动（`Transport-X/Y/Z`、`Drive-Rot-*`、`Sensor`、`Carrier-*`、`Snap-<轴><流向>-<typeId>`） | `src/core/library-component-loader.ts:102` |
| `Path` 载荷支持 line/arc 段、`closed`、`align` 上向量 | `schema/v1/specification.md` §7a.34 |
| Node 端手写 glTF 二进制生成 GLB 的既有先例 | `scripts/build-physics-test-glb.mjs`、`scripts/generate-conformance-glbs.mjs` |
| 库目录分类 = 第一层子目录名经 `humanize()`；`PaintLine` → `Paint Line` | `scripts/build-local-library-catalog.mjs:37,115` |
| model plugin pack 按 GLB 文件名自动绑定的现成模式 | `src/plugins/models/DemoProcessIndustry/index.ts` |
| 每模型的逐帧驱动脚本先例 | `src/plugins/models/DemoRealvirtualWeb/robot-follow-position.ts` |
| Kiosk Tour API：`camera()` / `highlight()` / `instruction()` / `message()` / `filter()` | `src/plugins/kiosk-tour-types.ts` |

**缺口**

- `public/library/` 当前仅 17 个条目、单一分类 `Pallet Handling`（经 `public/library/catalog.json` 核对）。涂装线所需对象一个都没有。
- 全仓无任何 spray / paint 相关运行时代码（已 grep 确认）。
- 本仓无 Unity 工程，现有库 GLB 均来自 realvirtual Unity 资产包，其材质 `assetPath` 指向 `Assets/realvirtual-Library/...`。

**已知限制（来自 `src/behaviors/OverheadConveyor.ts` 模块注释，逐条引用）**

1. 载具位姿写在**载具的 LOCAL 帧**，基于「父节点为单位变换」的 Phase-1 假设；嵌套父节点的 world→local 转换是已记录的 follow-up。
2. 刚性链无离散到达事件，刻意不提供 `des` 块。
3. 积放式自由小车未实现。
4. `L == 0` / `N == 0` / `pitch <= 0` 均有明确降级路径（不产生 NaN）。

## State Ownership and Compatibility

| 新增状态 | 写入位置 | 兼容性 |
| --- | --- | --- |
| 库对象几何与命名约定 | `public/library/PaintLine/*.glb`（生成物） | 纯新增目录，不触碰 `PalletHandling/` |
| 链条参数（速度/加速度/间距/起始相位） | 库对象根节点 `rv_extras.realvirtual.OverheadConveyorBehavior` | 使用组件已有 schema 字段，无新字段 |
| 闭环路径几何 | 库对象内 Path 节点的 `rv_extras.realvirtual.Path` | 使用 `schema/v1` §7a.34 既有字段 |
| 库目录条目 | `public/library/catalog.json` | 由 `scripts/build-local-library-catalog.mjs` 重新生成，不手改 |
| 场景布局 | `public/scenes/DemoPaintLine.glb` + `index.json` 新增一行 | 纯新增 |
| 演示层运行时状态（喷涂相位、工件颜色） | model plugin pack 内存态，不持久化 | 每次加载从确定初值重建 |
| 字幕文案 | `src/core/i18n/catalogs/{en-US,zh-CN}.ts` | 仅新增 key，不改名、不删除既有 key |

生成器必须**可复现**：同一输入两次运行产出字节一致的 GLB，否则无法 diff 审查。

## Allowed Paths

- `scripts/build-paintline-library.mjs`
- `scripts/build-paintline-scene.mjs`（2026-08-21 追加，见 Decision Log）
- `public/library/PaintLine/`
- `public/library/catalog.json`（经生成器更新，不手改）
- `public/scenes/DemoPaintLine.glb`
- `public/scenes/index.json`
- `src/plugins/models/DemoPaintLine/`
- `src/core/i18n/catalogs/en-US.ts`、`src/core/i18n/catalogs/zh-CN.ts`、`src/core/i18n/catalogs/en-US.deferred.ts`（仅新增 key；`demo` 命名空间的英文文案实际位于 deferred 目录，2026-08-21 追加）
- `scripts/i18n-verbatim-check.mjs`（仅在 `NEW_STRING_EXEMPTIONS` 中声明本次新增文案，2026-08-21 追加，见 Decision Log）
- `tests/`（本计划新增用例）
- `e2e/`（本计划新增场景）
- `package.json`（仅新增一条 `build:paintline` 脚本）
- `docs/exec-plans/proposed/EP-DEMO-001-paintline-demo.md`
- `docs/exec-plans/proposed/README.md`

## Forbidden Paths

- `schema/`
- `src/behaviors/`
- `src/core/`（`src/core/i18n/catalogs/` 的新增 key 除外）
- `public/library/PalletHandling/`
- `public/models/`
- `src/plugins/`（`src/plugins/models/DemoPaintLine/` 除外）
- 任何既有 i18n key 的重命名或删除

## Milestones

### M1 — 资产层：参数化库对象

交付 `scripts/build-paintline-library.mjs`，产出 `public/library/PaintLine/` 下 7 个对象：

| 文件 | 内容 | 关键约定 |
| --- | --- | --- |
| `PaintLineOverheadConveyor.glb` | 闭环轨道几何 + 40 个挂具 + 工件 | 文件名含 `OverheadConveyor` 以匹配 `*OverheadConveyor*`；挂具节点名 `Carrier-01`…`Carrier-40`；含 `closed: true` 的 Path 节点；根节点带 `OverheadConveyorBehavior` 配置 |
| `PretreatTunnel-8m.glb` | 前处理隧道壳体（两端开口） | `Snap-ZN-paintseg` / `Snap-ZP-paintseg` |
| `DryOven-6m.glb` | 烘干炉箱体 + 顶部风室 | 同上 |
| `SprayBooth.glb` | 喷房壳体 + 喷涂机构 | 含**恰好命名为** `Drive-Lin-Y` 的往复台车（驱动名解析锚定，不容后缀，见 Surprises 第 1 条）；同上 |
| `CoolingZone-4m.glb` | 冷却段（半透明） | 同上 |
| `LoadUnloadStation.glb` | 上下件房壳体 | `Snap-ZB-paintseg` |
| `Workpiece-Bracket.glb` | 独立工件（可单独拖放） | — |

几何全部由长方体与挤出体构成，风格对齐参考动画的「白色壳体 + 半透明彩色分区」。

**闭环路径参数**（跑道形，XZ 平面，轨道高度 y = 2.6 m）。流向轴在实施中由 X 改为 **Z**，见 Surprises & Discoveries 第 4 条：

| 段 | 几何 |
| --- | --- |
| 直线 | (0, 2.6, 0) → (0, 2.6, 30) — 工艺段侧，+Z |
| 圆弧 180° | 圆心 (3, 2.6, 30)，半径 3，`startAngle 180`，`clockwise: true` |
| 直线 | (6, 2.6, 30) → (6, 2.6, 0) — 上下件与返程侧，−Z |
| 圆弧 180° | 圆心 (3, 2.6, 0)，半径 3，`startAngle 0`，`clockwise: true` |

周长 = 60 + 6π ≈ 78.85 m，`Pitch = 0`（组件自动按 L/N 均分 ≈ 1.97 m）。`align = [0,1,0]`。`clockwise` 的取值不是风格选择：它是保持两段直线与圆弧切线连续的唯一解，已由测试对拍运行时解析器确认。

**链速取值**：默认 `TargetSpeed = 300` mm/s（18 m/min），一圈约 4.4 分钟，便于观看。真实连续涂装线通常为 2–6 m/min，此为**演示取值而非工程取值**，必须在计划的 Outcomes 与 Tour 字幕中如实标注。

**正例**：`npm run build:paintline && npm run build:library` 后 `catalog.json` 出现 `Paint Line` 分类共 7 条；Planner 库面板可见并可拖放。
**反例**：生成器对 `N = 0`、零长度路径输入应报错退出而非产出损坏 GLB。
**验证**：`node scripts/build-paintline-library.mjs` 连续两次运行产物字节一致；新增 Node 单测校验产物的节点名、Path 段数、`closed` 标志与 `rv_extras` 载荷。

### M2 — 场景层：拼装并跑通

用 Layout Planner 摆放四个工艺段与上下件房。工艺段跨坐在 x = 0 的 +Z 直线段上，沿 Z 依次为：前处理 z∈[2,10] → 烘干 z∈[11,17] → 喷房 z∈[18,24] → 冷却 z∈[25,29]；上下件房置于 x = 6 的返程侧 z∈[8,16]。保存为 `public/scenes/DemoPaintLine.glb` 并登记进 `index.json`。

**M2 必须解决的加载前提**（M1 发现，见 Surprises & Discoveries 第 2 条）：库目录不会隐式自动加载。演示场景必须通过项目清单 `libraries[]` 或 `?library=` 显式引用 `library/catalog.json`，否则 Planner 打开时素材库为空。这一步要在摆放之前确定，不能留到 M3。

工艺停留时间 = 段长 ÷ 链速（连续线工件全程不停），例如 8 m 前处理段在 300 mm/s 下约 26.7 s。

**M2 必须最先验证的风险项**（M1 已把它从「挂具会不会跟随放置」收窄为「路径坐标系与世界坐标系是否发散」，见 Surprises & Discoveries 第 3 条）：验证把输送链放置到非原点位姿后，挂具是否仍与轨道几何、工艺段保持相对正确，以及 `path-visualizer-plugin` 等把路径当世界坐标的消费者是否出现偏移。

- 若只有路径可视化偏移：v1 场景把输送链放在原点且不施加变换，并在 Outcomes 中登记该限制。
- 若挂具与轨道本身发散且必须修 core：停止本计划的 M2，把该缺陷单独登记进 `docs/governance/KNOWN_DEVIATIONS.md` 并另开计划，不在本计划中越界修改 `src/core/`。

**正例**：加载场景后链条推进，挂具姿态竖直，`OverheadConveyor.Position` 单调递增并在周长处回绕。
**反例**：暂停仿真时链条停止；重置后挂具回到 `StartPhase` 对应的确定相位。
**验证**：Playwright 场景断言挂具世界坐标随时间变化且无 NaN、四元数无翻滚；保存 / 重载后相位与布局可复现。

### M3 — 叙事层：演示插件与讲解

新增 `src/plugins/models/DemoPaintLine/`：

- `index.ts` — 按 `models = ['DemoPaintLine', 'demopaintline']` 绑定，注册下列插件并设置默认环境预设。
- `spray-motion.ts` — 逐帧驱动喷房 `Drive-Lin-Y-Reciprocator` 做正弦往复，并渲染半透明喷幅锥体。对标 `robot-follow-position.ts` 的实现层级。
- `workpiece-coating.ts` — 读取各挂具在闭环上的相位，越过喷房区间时把工件材质由本色切换为漆色，回到上件位复位。
- `paintline-kiosk-tour.ts` — 四段镜头脚本：整体俯视 → 前处理 → 烘干 → 喷房（推近至机构）→ 冷却 → 回到俯视，每段 `highlight()` 对应节点并 `instruction()` 弹出字幕。

字幕全部走 i18n key，中英双语同时新增。

**正例**：进入 Kiosk 模式自动播放，切换语言字幕同步切换。
**反例**：中途退出 Kiosk 模式，`AbortSignal` 生效，镜头与字幕立即停止且不残留 overlay。
**验证**：`npm run i18n:inventory` 无新增裸字符串；Playwright 断言 Tour 每段的字幕文本与高亮节点；人工浏览器视觉验收对照参考动画。

### M4 — 可选扩展（本计划不承诺交付）

按需另行评估：喷房六轴机器人 IK 动作（`schema/v1` §7a.26 `RobotIK`）、节拍与产量 KPI 面板、蛇形积放缓冲段（需先提 ADR）、DES 模式支持（需先解决刚性链无离散事件的设计问题）。

## Progress

- [x] M1 资产层 —— 2026-08-21 完成，证据见 Validation「M1 实际执行证据」
- [x] M2 场景层 —— 2026-08-21 完成，证据见 Validation「M2 实际执行证据」
- [x] M3 叙事层 —— 2026-08-21 完成，证据见 Validation「M3 实际执行证据」
- [ ] Outcomes 与证据补齐

## Surprises & Discoveries

计划期发现（M1 之前）：

- 2026-08-21：确认行为匹配的是 GLB **文件名**而非节点名（`src/core/behaviors.ts:14`）。因此输送链库对象文件名必须包含 `OverheadConveyor` 才能被 `*OverheadConveyor*` 匹配，这约束了 M1 的命名。
- 2026-08-21：确认库对象逻辑不依赖 Unity 专有 extras，仅依赖节点命名约定 + `rv_extras` 载荷（dump `public/library/PalletHandling/ChainConveyor-1m.glb` 验证）。这是 Node 程序化生成路线成立的前提。

M1 执行期发现：

1. **`Drive-` 命名解析是锚定的，不容后缀**。`parseDriveName` 的正则是 `^Drive-(Lin|Rot)-([XYZ])$`（`src/core/library-component-loader.ts:38`），原设计里的 `Drive-Lin-Y-Reciprocator` 不会被解析，且同一对象内不能有两个同名 `Drive-Lin-Y`（GLB 导出的 ` (1)` 后缀同样不解析）。喷房因此改为**单一往复台车 `Drive-Lin-Y` 承载左右两侧喷枪臂**——这与真实往复机龙门的机械结构一致，不是权宜之计。已由 `tests/paintline-library.node.test.ts` 锁定。

2. **库目录不会隐式自动加载——`doc-layout-planner.md` §4.1 已漂移**。该文档称标准库「随构建自动加载」并指名 `loadBundledLibrary`（`planner-persistence.ts`）。实际 `src/` 中**不存在该函数**，且 `src/plugins/layout-planner/index.ts:466` 明确写着 `DEFAULT_LIBRARY_URLS: string[] = []`，注释为「Kept EMPTY on purpose: no library is ever loaded implicitly — not a bundled one, not a remote one」。浏览器验证确认：`?mode=planner` 打开时素材库面板为空并提示手动添加；加 `?library=/library/catalog.json` 后 24 个条目（Paint Line 7 + Pallet Handling 17）全部出现。按 `docs/LEGACY_DOCUMENT_REGISTER.md` 使用规则 3，漂移登记于此。影响：M2 必须显式引用目录，已写入 M2。

3. **「父节点为单位变换」风险的范围被收窄**。`pathFromNode`（`src/core/engine/rv-path.ts:420`）只解析 extras 载荷，**不施加任何世界矩阵**。因此路径坐标与载具局部坐标处在同一帧，载具会随放置根节点的变换一起移动，轨道几何与挂具不会互相发散。真正的暴露面是：把路径当世界坐标消费的其他模块（路径可视化、路径图、区域互斥）在非原点放置时会偏移。M2 的首个验证动作已相应改写。

4. **流向轴由 X 改为 Z**。原计划的工艺段沿 X 排布，但现有库统一使用 `Snap-Z*` 流向约定（`Snap-ZN-convchain` / `Snap-ZP-convchain`）。为与之一致，闭环长边与全部工艺段改为沿 Z，段长与工艺顺序不变。M1 的路径参数表与 M2 的坐标已同步更新。

5. **链速与配置不符**。浏览器采样显示挂具约 4 秒推进 2.0 m（≈500 mm/s），与 `TargetSpeed = 300 mm/s` 不符。当时归因于 SwiftShader 追帧，**该归因在 M2 被证伪**：真实原因是配置根本没被读取，组件一直在跑 `DEFAULTS.TargetSpeed = 500`。详见 M2 发现第 7 条。

M2 执行期发现：

6. **已发布场景的行为不会自动绑定——需要场景文件自带 `LayoutObject`**。场景 GLB 是无网格的放置清单，composition 能正确解析并嫁接全部 6 个子树（日志：`Composition: 6 occurrence(s) from 6 file(s), 6 load(s), 0 unresolved`），loader 层的 rv-ODT 组件（如喷房的 `Drive-Lin-Y`）也正常创建，**但 `src/behaviors/*.ts` 一个都没绑定，整条线静止**。原因：行为按放置分发依赖 `isLayoutObjectRoot`，即 `realvirtual.LayoutObject`（`src/core/behaviors.ts:352`）；该标记在运行时由 Planner 的 `adoptPlacements` 盖上，而这个交接在 `?scene=published:<name>` 路径上不触发。仓库自带的 `public/scenes/DemoPlanner.glb` 同样不带该标记（其资产路径 `/models/library/...` 也已失效，无法作为对照）。解决办法留在 Allowed Paths 内：由场景生成器**把 `LayoutObject` 直接写进文件**——这正是认领时会写入的内容，且 `adoptPlacedNode` 无条件重盖，后续认领仍幂等。未修改 `src/core/`。

7. **行为的实例配置必须挂在放置节点上，不能只挂在库 GLB 根节点**。行为从 `self.root` 读配置（`configBag`），而 `self.root` 是分发作用域：按放置分发时是**放置节点**，库 GLB 的根节点只是它的子节点。配置写在下一层会被静默忽略并回落到 schema 默认值——表现为链条以 500 mm/s 运行且不报任何错。修复后实测 **299.6 mm/s**，与配置的 300 mm/s 相符。这条同时解释并纠正了 M1 发现第 5 条的错误归因。附带结论：以 `?model=` 单独加载库 GLB 时，`self.root` 是场景根，配置同样读不到，此时组件按默认值运行——本计划不为此改动库对象，如实记录。

8. **`*Conveyor*` 与 `*OverheadConveyor*` 的 glob 必然重叠（惰性，不修）**。任何匹配 `*OverheadConveyor*` 的资产名必然也匹配 `Conveyor` 的 `models: ['*Conveyor*']`，因此 ZPA `Conveyor` 行为也会绑到悬挂链上，多声明 4 个 `Flow.*` 信号。它在 `setup` 中因找不到 `Transport-*/Sensor-*` 而 `self.disable()`，功能上无影响，仅是信号命名空间的冗余。这是仓库既有 glob 设计的固有结果，收窄 `Conveyor` 的 glob 属于修改 `src/behaviors/`（Forbidden Path）且改动公共契约，需另立计划。如实披露，不在本计划处理。

M3 执行期发现：

9. **Tour 字幕会叠加，除非给一个稳定的 instruction id**。`t.instruction()` 默认生成 `kiosk-inst-auto-<n>` 这样的唯一 id，而 `showInstruction` 是按 id 覆盖的（`_instructions.set(id, …)`，`src/core/hmi/instruction-store.ts:172`）。默认行为下七段字幕会同时留在屏幕上——首次录屏即复现。改为全部使用固定 id `paintline-tour-caption` 后每段覆盖上一段。已由 e2e 断言字幕条数为 1 锁定。

10. **工艺段是不透明闭合壳体，侧面平视镜头只能拍到一堵墙**。生成器给隧道/炉体/喷房都加了侧墙与顶板，只有两端开口。因此工位镜头改为抬高的四分之三视角（能同时看到段体与进出的挂具），喷房则把相机放到入口内部——这也正是参考动画在近景时的处理。喷房那一段同时关闭高亮：相机在壳体内部时，高亮描边会包住整个画面而不是标示对象，为此给 Stage 增加了 `outline` 开关。

11. **`/__api/debug` 会跨页面串数据，不能用于断言**。该端点返回的是「最后一次被推送的快照」（约 1 Hz），而推送方是任意页面——包括上一个测试的页面。M2 的 e2e 一度因此读到 `undefined`，看起来像行为回归，实际是读到了别的页面的状态。已全部改为在页面内直接读 `viewer.signalStore`，并把固定 sleep 换成轮询到条件成立。

12. **墙钟测速在软件渲染下不成立，必须用仿真时钟**。M3 插件加载后，SwiftShader 环境的定步长仿真只跑到实时的约 40%，同一条链用墙钟测出 120–155 mm/s。改用 `simTickCount / 60 Hz` 作分母后测得约 284 mm/s（目标 300，残差是 tick 计数与每 tick 一次的信号推送之间的采样偏移），而若回落到 500 默认值会测出约 473——两者可清晰区分。同时补了一条与帧率无关的精确不变量：挂具行进距离与链相位增量之比恒为 **1.0000**。

13. **喷房占用判据在本场景中恒为真（未被反向验证）**。40 个挂具、间距 1.97 m、喷房长 6 m，任意时刻都有约 3 个挂具在喷房内，因此「无工件时停喷」这条分支从未触发。代码路径正确但本演示不构成对它的验证，如实记录。

交付后发现（用户在真实 GPU 上验收时暴露）：

14. **生成的 GLB 缺少 NORMAL 属性，在真实 GPU 上整条线渲染为纯黑剪影**。M1 起我刻意只写 `POSITION`，理由是 glTF 规范规定读取端在缺少法线时必须计算平面法线——规范是对的，但本产品的渲染路径并不因此安全：viewer 用的是 `MeshStandardMaterial`（`__rvUberMaterial`），没有法线就没有光照，表面全黑，而地面与阴影仍然正确，所以「看起来不像坏了」。仓库自带的 `PalletHandling/*.glb` 与 `DemoRealvirtualWeb.glb` 全部携带 NORMAL，我却对照了 `scripts/build-physics-test-glb.mjs`（一个不可见的物理夹具）作为先例。

    **这个缺陷穿过了 M1/M2/M3 的全部验证**：我的 Playwright 环境无硬件 GPU，自动降级到 SwiftShader 并被应用切换到 "Fast" 视觉预设，该路径下缺法线仍显示为浅色，因此三个里程碑的每一张截图都是「正常」的。这是环境盲区，不是断言不足——已改为共享 24 顶点立方体（每面 4 顶点、各带面法线），并补三条回归断言：每个 primitive 必须声明 NORMAL、法线必须为单位长度且朝外、三角形绕序必须与法线一致；E2E 另加一条「场景内每个可渲染网格都带 normal 属性」。

15. **`workpiece-coating` 恢复本色的方式是错的**。原实现把「本色」硬编码为 `new Color(0.34, 0.35, 0.39)`（库材质的 `baseColorFactor`）。实际上 viewer 会把 GLB 材质替换为共享的 `__rvUberMaterial`，其 `.color` 为白色，资产本色经由另一通道生效——因此每个跑完一圈的工件都会被刷成一种它从未有过的深灰，且颜色分布随时间单向漂移（实测由 34/46 漂到 78/2）。改为在首次重绘前捕获每个网格自身的颜色并恢复它；分布现已稳定在 34 已喷 / 46 未喷，与几何预期（约 42% 行程处于已喷区间）一致。同一处也修正了 E2E 中把本色写死成 RGB 的判定。

16. **性能未评估的一点**：变色插件为 80 个工件各克隆一份 `__rvUberMaterial`。uber 材质通常参与批处理，80 份克隆可能削弱批处理效果。本环境（软件渲染）无法给出有意义的性能结论，如实登记为未验证项。

17. **链条在画面上从未真正动过——两道静态优化把挂具当成了布景**。用户报告「产线不运行」。实测：仿真推进 315 tick、`Carrier-01` 由 5.05 m 走到 8.45 m，而画布像素**逐字节相同**。根因是加载器的两套「是否会动」分类都不认识 `OverheadConveyor`：

    - `src/core/engine/rv-freeze-static.ts` 的 `MOVER_KEY = /^(Drive|Kinematic|Grip|TransportSurface|Source|Sink|MU|Cam|SceneButtonMoveable)/i` —— 不匹配就把 `matrixWorldAutoUpdate` 关掉，整个子树被 `updateMatrixWorld` 跳过；
    - `src/core/engine/rv-scene-loader.ts` 的 `MOTION_KEY = /^Drive|^Kinematic(_\d+)?$/i` —— 不匹配就把网格并进根挂载的静态 arena，该文件原话是 *"which cannot move by construction"*。

    挂具不带任何 rv_extras 组件，输送链根节点带的 `OverheadConveyorBehavior` 也不匹配，于是两道都判它是布景。同一个文件里记录过同类旧 bug 的症状：*「信号翻转、灯亮了，但拨杆从来不动」*，以及 *「驱动臂在动，连杆和平台悬在半空不动」*，并注明 *「两套分类不一致就是那个 bug」*。

    **完整演示场景一直掩盖着它**：M3 的喷房 `Drive-Lin-Y` 是真 drive，每帧顺带把场景标脏并驱动自身矩阵，所以画面确实在变——变的只有往复机。把它停掉，冻结立刻重现。

    修复（均在 Allowed Paths 内）：① 挂具节点加 `rv_extras.realvirtual.Kinematic`——该键的语义正是「变换由求解器每 tick 写入的刚性组」，且是两套分类唯一都认的键；② 新增 `chain-redraw.ts` 演示插件，在挂具位姿变化时调用 `markRenderDirty()`，因为按需渲染只由运行中的 RVDrive 标脏。两者缺一不可。

18. **这暴露了我的验证方法有系统性缺陷**。M1 到 M3 的全部断言——信号、`position`、tick 计数、四元数、间距——测的都是**仿真状态**，没有一条测渲染结果。上述三个里程碑因此全部「通过」，而画面里的链条从未动过。已补 `actually repaints the moving chain`：截取真实渲染画布两次并比较字节，且**先停掉喷房 drive**，防止它再次替代性地让测试通过。这类「资产在产品的渲染管线里是否真的动/亮」的断言，此前只有法线那一条（同样是交付后才补的）。

19. **核心层缺口仍然存在，未修**：`OverheadConveyor` 对上述两套分类不可见，任何单独使用该库对象或把它放进自建布局的人都会遇到同样的冻结（实测：`?model=` 单独加载库对象仍冻结）。正确修法是在 `rv-freeze-static.ts` 与 `rv-scene-loader.ts` 中把 `OverheadConveyor`/`Carrier` 纳入分类，并让组件在相位推进时自行标脏——三处都在本计划的 Forbidden Paths（`src/core/`、`src/behaviors/`）内。按计划既定规则登记为**必须另立计划**的核心缺陷，本计划不越界修改。

20. **一条自造的测试偶发**：「往复机在动」原本用相隔 4 秒的两点采样判定，而 1.2 m 行程在 700 mm/s 下往返约 3.4 秒——间隔与周期混叠，两次采样落回同一位置就误报停机。已改为多点采样判位移跨度，与周期无关。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因 |
| --- | --- | --- | --- |
| 2026-08-21 | 几何来源采用 Node 程序化生成，不走 Unity 导出、不引入外部 CAD | 用户在本次会话中明确选择 | 本仓无 Unity 工程；程序化路线纯仓内、可复现、可 diff、开源可分发，且参考动画的白盒风格几乎全由长方体构成 |
| 2026-08-21 | 交付定位为「先演示片、再数字孪生」，v1 零新增库行为 | 用户在本次会话中明确选择 | 符合 `CHANGE_MANAGEMENT.md` §6 黄金切片；连续涂装线工件全程不停，停留时间由段长与链速决定，因此不需要工位驻留行为 |
| 2026-08-21 | v1 范围限定为单闭环 + 四个工艺段，不做完整厂区 | 用户在本次会话中明确选择 | 完整厂区需要积放缓冲，而该能力在 `OverheadConveyor` 中明确未实现，会把任务从「新增资产」升级为「改核心状态模型 + ADR」 |
| 2026-08-21 | 不提 ADR | 本计划全部为新增文件，未改契约、边界或状态所有权 | 依 `CHANGE_MANAGEMENT.md` §2 判定不触发 ADR 条件；M4 若做积放则必须补 ADR |
| 2026-08-21 | 计划获批，由 `proposed/` 移入 `active/`，状态升级为 `approved / active`，开始执行 M1 | 用户在本次会话中明确批准（原话：「批准这个计划，移到 active/ 开始 M1」） | 用户已审阅 Scope、Non-goals 与 Forbidden Paths，未提出放宽要求，`src/behaviors/` 与 `src/core/` 的禁止边界按原文生效 |

| 2026-08-21 | M2 的演示场景改为**程序化生成**（`scripts/build-paintline-scene.mjs`），不在 Planner 里手工拖放保存；Allowed Paths 相应追加该脚本 | Agent 在 M2 实施中的工程决定，不涉及产品或架构闸口 | 手工拖放产出的场景是无法 diff、无法复查、无法重跑的二进制；库对象已确定性生成，场景同源生成才能让整个演示可从源码复现。风险是生成物必须精确匹配 Planner 的持久化格式，已通过对照仓库自带的 `public/scenes/DemoPlanner.glb` 结构并在浏览器中端到端验证来控制 |

| 2026-08-21 | M3 的英文新增文案在 `scripts/i18n-verbatim-check.mjs` 的 `NEW_STRING_EXEMPTIONS` 中逐条声明；Allowed Paths 相应追加该脚本与 `en-US.deferred.ts` | Agent 在 M3 实施中的工程决定；使用的是仓库既有的、为此目的设计的机制 | ADR-0001 §3 门禁要求英文文案能在迁移基线提交中逐字找到，用以证明「英文目录是搬运而非重写」。本次 7 条是上游不存在的新功能文案，按该机制逐条声明并写明理由，比移动基线更能保住门禁对其余 2000+ 条的证明力 |

前四条均为用户在会话中的明确选择或批准；后两条是 Agent 的实施决定，已如实标注来源。

## Validation

计划执行时必须逐项运行并记录实际输出，不得填写预期结果：

- `./scripts/verify.sh governance` — 文档元数据、唯一 ID、目录索引、链接
- `./scripts/verify.sh static` — 类型与 Lint
- `./scripts/verify.sh node` — 生成器单测与库对象结构断言
- `./scripts/verify.sh browser` — 组件绑定与运行时行为
- `./scripts/verify.sh build` — 构建（`prebuild` 会重跑库目录生成）
- Playwright：M2 的链条推进与保存/复原场景，M3 的 Tour 场景
- `npm run i18n:inventory` — 无新增裸字符串
- 生成器可复现性：连续两次运行产物字节一致
- 人工：浏览器视觉验收对照参考动画；跨语言字幕切换

**必须如实披露的未验证项**：DES 模式行为、PLC/工业接口接入、移动端与低端 GPU 性能、真实涂装工艺参数的工程正确性（本计划的链速与停留时间是演示取值）。

### M1 实际执行证据（2026-08-21）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| 生成 7 个库对象 | `node scripts/build-paintline-library.mjs` | 7 个 GLB 共 39 164 字节；输送链 281 节点 / 27 264 字节 |
| 可复现性 | 连续两次运行后 `shasum -a 256` 对比 | 7 个文件哈希完全一致 |
| 库目录重建 | `npm run build:library` | 24 条目：Paint Line 7、Pallet Handling 17 |
| 结构与契约单测 | `npx vitest run --config vitest.node.config.ts tests/paintline-library.node.test.ts` | 43 passed |
| 全量 Node 测试 | `./scripts/verify.sh node` | 546 passed / 7 skipped，退出码 0 |
| 静态门禁 | `./scripts/verify.sh static` | 退出码 0 |
| 治理门禁 | `./scripts/verify.sh governance` | 37 篇受管文档通过，无悬空链接 |

浏览器验证（Playwright + SwiftShader 软件渲染，`http://127.0.0.1:5173`）：

- `?model=/library/PaintLine/PaintLineOverheadConveyor.glb` — 组件按文件名绑定成功，`OverheadConveyor.Run = true`、`Moving = true`、`Position` 由 8.33 mm 递增至 937.5 mm；无 pageerror。
- 挂具确实沿闭环推进且分支方向正确：`Carrier-01` z 2.162→4.162（x=0 段 +Z）、`Carrier-11` z 21.875→23.875（+Z）、`Carrier-21` z 27.838→25.838（x=6 段 −Z）、`Carrier-31` z 8.125→6.125（−Z），y 恒为 2.6。两段 180° 圆弧的换向正确。
- 截图确认跑道形轨道、两端圆弧、支柱与 40 组挂具正常渲染。
- `?mode=planner&library=/library/catalog.json` — 素材库显示「realvirtual Library / 24 components」，7 个涂装线对象全部在列。

**M1 未验证项**：链速定量正确性（见 Surprises & Discoveries 第 5 条）；拖放放置后的行为绑定（M1 只验证了目录可见与按文件名加载两条路径，Planner 内拖放放置属于 M2）；硬件加速环境下的渲染与性能。

### M2 实际执行证据（2026-08-21）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| 生成演示场景 | `node scripts/build-paintline-scene.mjs` | `DemoPaintLine.glb` 1 816 字节，6 个放置，登记进 `scenes/index.json` |
| 可复现性 | 连续两次运行后 `shasum -a 256` 对比 | 字节一致；`index.json` 登记幂等（重复运行仍只有 1 条） |
| 场景 E2E | `npx playwright test e2e/paintline-scene.spec.ts` | **7 passed**（1.9 分钟） |
| 静态门禁 | `./scripts/verify.sh static` | 退出码 0 |
| 治理门禁 | `./scripts/verify.sh governance` | 通过 |

浏览器实测（Playwright + SwiftShader，`?scene=published:DemoPaintLine`）：

- Composition 解析 6/6 引用，0 unresolved；场景内 40 个 `Carrier` 节点、288 个网格；无 pageerror。
- 6 个放置全部落在设计坐标：输送链 `[0,0,0]`、前处理 `[0,0,6]`、烘干 `[0,0,14]`、喷房 `[0,0,21]`、冷却 `[0,0,27]`、上下件房 `[6,0,12]`。
- 行为绑定：`PaintLineOverheadConveyor.OverheadConveyor.Run = true`、`.Moving = true`、`.Position` 持续递增；fps 60。
- **链速 299.6 mm/s**（同一节点两次实读、墙钟计时），与配置的 300 mm/s 相符。
- **相邻挂具间距误差 1.11e-15 m**（pitch = 1.9712 m），13 对相邻挂具全部通过——该判据与帧率无关。
- **40 个挂具的四元数 x、z 分量精确为 0**，y 恒为 2.6：穿过两个 180° 弯道后仍严格垂直，无 Frenet 翻滚。
- 行进方向正确：x=0 工艺侧 +Z，x=6 返程侧 −Z。
- 重载后 6 个放置变换逐分量一致。

**M2 未验证项**：硬件加速环境下的渲染质量与性能（全部证据来自 SwiftShader 软件渲染）；Planner 内手工拖放放置这条交互路径（本计划的场景为程序化生成，未走该路径）；`npm run e2e` 全量套件（本机缺 `dist-embed`，共享 Playwright 配置的 `preview:embed` webServer 无法启动，故本次以等价的临时配置对同一 spec 执行，已删除该临时文件）。

### M3 实际执行证据（2026-08-21）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| 类型检查 + Lint | `./scripts/verify.sh static` | 退出码 0 |
| Node 测试 | `./scripts/verify.sh node` | 547 passed / 7 skipped，退出码 0 |
| i18n 盘点 | `npm run i18n:inventory` | 退出码 0，无新增裸字符串 |
| ADR-0001 §3 逐字门禁 | 同上 Node 套件内 `tests/i18n-preboot.node.test.ts` | 先失败（7 条新英文文案不在迁移基线中），在 `NEW_STRING_EXEMPTIONS` 逐条声明理由后通过 |
| 治理门禁 | `./scripts/verify.sh governance` | 通过 |
| 两个涂装线 E2E 套件 | `npx playwright test e2e/paintline-*.spec.ts` | **13 passed**（3.5 分钟） |

浏览器实测（Playwright + SwiftShader）：

- 插件包**按目录名绑定**（未声明已废弃的 `models[]`）：`DemoPaintLine` 目录名与解析出的模型名匹配成功。
- 往复台车动作：`Drive-Lin-Y` 位置在 0–1200 mm 行程内往复，采样 14 次未越限，jog 方向发生翻转。
- 工件变色：80 个工件各自持有**独立材质**（克隆成功），任一时刻同时存在已喷与未喷两组（实测 34 / 46）。
- Kiosk Tour：`hasTour / hasCurrentModelTour` 均为 true，`tourName = DemoPaintLine`；启动后镜头依次推进，中文环境显示「连续输送式涂装线 —…」，英文环境显示「Continuous conveyorised paint line —…」，屏幕上**同时只有一条字幕**。
- 无 pageerror。

**M3 未验证项**：硬件加速环境下的画质与性能（法线缺陷正是在此暴露，见 Surprises 第 14 条；修复后仍需你在真实 GPU 上确认）；变色插件克隆 80 份 uber 材质对批处理的影响；喷房「无工件时停喷」分支（见 Surprises 第 13 条）；Tour 完整循环回到起点后的长时间稳定性（仅验证到第一轮各段）；真实触摸屏 Kiosk 设备上的空闲自动启动。

## Rollback

全部为新增文件，无 Schema 变更、无持久化迁移、无外部状态：

1. 移除 `public/library/PaintLine/`、`scripts/build-paintline-library.mjs`、`src/plugins/models/DemoPaintLine/`、`public/scenes/DemoPaintLine.glb` 及新增测试文件。
2. 重新运行 `npm run build:library` 让 `public/library/catalog.json` 回到仅含 `Pallet Handling`。
3. 从 `public/scenes/index.json` 移除新增条目。
4. 撤销 i18n catalogs 中新增的 key 与 `package.json` 中新增的脚本行。

回滚不影响任何既有场景、库对象或已保存项目。

## Outcomes & Retrospective

**结果**：M1–M3 全部交付。`?scene=published:DemoPaintLine` 打开即得一条运行中的连续输送式涂装线——闭合悬挂链带 40 个挂具循环穿过前处理、烘干、喷涂、冷却四段，喷房往复机动作，工件过喷房变色、回上件位复位，Kiosk Tour 中英双语分段讲解。用户已在真实 GPU 上确认画面与运动均正常。

**最终验证**（2026-08-22）：governance 0 · static 0 · node 556 passed / 7 skipped · i18n 0 · 涂装线 E2E **15 passed**；两个生成器均字节可复现。

**交付物**：`scripts/build-paintline-library.mjs`、`scripts/build-paintline-scene.mjs`、`public/library/PaintLine/` 7 个库对象、`public/scenes/DemoPaintLine.glb`、`src/plugins/models/DemoPaintLine/`（4 个插件 + Tour）、`tests/paintline-library.node.test.ts`、`e2e/paintline-scene.spec.ts`、`e2e/paintline-demo-plugins.spec.ts`、中英各 7 条 i18n 词条。

**偏差**：M2 的场景由程序化生成而非 Planner 手工拖放（Decision Log 2026-08-21）；Allowed Paths 三次追加（场景生成器、`en-US.deferred.ts`、`i18n-verbatim-check.mjs`），均已逐条记录理由。

**最值得记取的一条**：M1–M3 的全部断言测的都是**仿真状态**（信号、`position`、tick、四元数、间距），没有一条测渲染结果。因此两个只在真实渲染管线中才显形的缺陷完整穿过了三个里程碑的验证——法线缺失（画面全黑）与静态分类冻结（画面不动），两次都由用户在真机上发现。教训不是「断言写少了」，而是**验证层次选错了**：资产类工作必须有一条断言落在渲染输出上。已补 `loads every mesh with real surface normals` 与 `actually repaints the moving chain`（后者刻意先停掉喷房 drive，防止它替代性地让测试通过）。

**遗留债务（未修，已交接）**：
- `OverheadConveyor` 对加载器的两套静态分类（`rv-freeze-static.ts` 的 `MOVER_KEY`、`rv-scene-loader.ts` 的 `MOTION_KEY`）不可见，单独使用该库对象仍会画面冻结（实测 `?model=` 加载仍冻结）。演示场景已用挂具上的 `Kinematic` 标记 + `chain-redraw.ts` 绕开。核心修复移交 [`EP-CONV-001`](../active/EP-CONV-001-overhead-conveyor-accumulation.md)。
- `Conveyor` 与 `OverheadConveyor` 的 glob 必然重叠，悬挂链上多 4 个惰性 `Flow.*` 信号（Surprises 第 8 条）。
- 变色插件为 80 个工件各克隆一份 uber 材质，对批处理的影响未实测。
- 喷房「无工件时停喷」分支从未被触发验证（Surprises 第 13 条）。
- `doc-layout-planner.md` §4.1 关于库目录自动加载的漂移（Surprises 第 2 条）仍未修文档。

**未验证项**：DES 模式；PLC/工业接口；移动端与低端 GPU 性能；真实涂装工艺参数的工程正确性（链速 300 mm/s 是演示取值）；Planner 内手工拖放放置路径。

**后续任务**：M4 三项（喷房六轴机器人 IK、节拍与产量 KPI、蛇形积放缓冲段）均未在本计划承诺。积放已由 Accepted [`ADR-0002`](../../adr/ADR-0002-overhead-conveyor-accumulation.md) 定型并移交 `EP-CONV-001`。
