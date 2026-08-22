---
doc_id: EP-DEMO-002
title: 涂装线喷房机器人与真实产线 KPI
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-22
authority: normative-process
---

# EP-DEMO-002：涂装线喷房机器人与真实产线 KPI

## Purpose

交付涂装线演示原定 M4 三项中剩余的两项：

1. **真实的节拍与产量 KPI** —— 数字全部由运行中的产线实测得出，不使用任何演示假数据。
2. **喷房六轴机器人** —— 用平台既有的 `RobotIK` 组件驱动，替换当前的单轴往复台车。

用户可观察到的成功标准：

1. 界面上出现涂装线自己的 KPI：**节拍**（相邻挂具通过同一点的间隔）、**产量**（每小时通过上下件位的工件数）、**缓冲段在库量**。
2. 关闭放行闸后，产量随之下降、在库量随之上升；重新开闸后回升——**数字跟着产线走**，不是预生成的曲线。
3. 喷房内是一台六轴机器人，随挂具通过而摆动喷枪，而不是上下往复的立柱。
4. 既有的涂装线演示行为（链条、积放、变色、Tour）不受影响。

## Scope

- `src/plugins/models/DemoPaintLine/`：新增 KPI 采集插件与涂装线专用 KPI 界面；改写喷涂运动插件以驱动机器人。
- `scripts/build-paintline-library.mjs`：为 `SprayBooth.glb` 生成六轴机械臂几何、`Drive-Rot-*` 关节链与 `RobotIK` 配置。
- `public/library/PaintLine/`、`public/scenes/DemoPaintLine.glb`：随生成器更新。
- `src/core/i18n/catalogs/`：KPI 标签的中英词条（仅新增 key）。
- `tests/`、`e2e/`：对应用例。

## Non-goals

- **不复用 `KpiDemoPlugin`**。该插件的文件头明确写着 *"Provides static dummy KPI data … generated once at construction time"*，是为 DemoRealvirtualWeb 准备的假数据。把它挂到涂装线上等于用演示数据冒充实测，违反 [`AGENTS.md`](../../../AGENTS.md) P0「不得用空实现、固定返回、演示数据或隐藏 TODO 冒充完成」。
- **不改 `src/plugins/demo/` 下的共享图表组件**（`OeeChart`/`PartsChart`/`CycleTimeChart`）。它们只接 `{ open, onClose }`、数据在内部取自假数据源，且由 DemoRealvirtualWeb 共用——改它们会波及另一个演示。
- **不做 OEE**。可用率/性能/质量需要停机与废品模型，本次没有可信数据源，凑出来就是假数据。
- **不接 PLC / 工业接口**。KPI 与机器人都由本地仿真驱动。
- **不改 `schema/v1`**、不改 `src/core/`、不改 `src/behaviors/`。`RobotIK` 是既有组件，本次只按其契约提供资产与配置。
- **不做 DES**。

## Required Documents and Decisions

- Completed [`EP-DEMO-001`](../completed/EP-DEMO-001-paintline-demo.md)、[`EP-CONV-001`](../completed/EP-CONV-001-overhead-conveyor-accumulation.md) —— 演示与积放的事实基础、遗留债务
- Accepted [`ADR-0002`](../../adr/ADR-0002-overhead-conveyor-accumulation.md) —— 积放的状态所有权；KPI 读取挂具位置时不得引入第二个位置来源
- [`../../governance/DEVELOPMENT_CONSTITUTION.md`](../../governance/DEVELOPMENT_CONSTITUTION.md)、[`../../governance/AI_SAFETY.md`](../../governance/AI_SAFETY.md)、[`../../governance/DEFINITION_OF_DONE.md`](../../governance/DEFINITION_OF_DONE.md)
- `schema/v1/specification.md` §7a.24–7a.26（`IKPath` / `IKTarget` / `RobotIK`），只读取不修改

**不需要 ADR**：不改技术栈、模块边界、状态所有权或任何已发布契约。KPI 是演示层派生量，机器人使用既有 `RobotIK` 契约。

## Current Repository Facts

以下经代码核对：

| 事实 | 位置 |
| --- | --- |
| `KpiDemoPlugin` 产出的是**静态假数据**，构造时一次性生成 | `src/plugins/demo/kpi-demo-plugin.ts` 文件头 |
| 共享图表只接 `{ open, onClose }`，数据内部获取，由 DemoRealvirtualWeb 共用 | `src/plugins/demo/{OeeChart,PartsChart,CycleTimeChart}.tsx`、`demo-hmi-plugin.tsx:87,98,109` |
| `TransportStatsPlugin` 统计的是 MU 的 spawn/consume；涂装线的挂具**不是 MU**，该插件不适用 | `src/plugins/transport-stats-plugin.ts` |
| `RobotIK` 通过 rv_extras 中的 **`Axis` 数组**（`ComponentReference` 指向各关节 `Drive`）解析关节链，不靠命名约定 | `src/core/engine/rv-ik-path.ts:760`、`rv-robot-ik.ts:52` |
| `RobotIK` 字段仅 `WristType` / `ElbowInUnityX` / `DrawGizmos` | `schema/v1/specification.md` §7a.26 |
| 关节链缓存在 `onSceneReady` 预热，晚于加载器的运动学重父化 | `src/core/engine/rv-robot-ik.ts:56` |
| 喷房现状：单个 `Drive-Lin-Y` 往复台车，左右各三支喷枪与喷幅盒 | `scripts/build-paintline-library.mjs` `buildSprayBooth` |
| 驱动名解析锚定 `^Drive-(Lin\|Rot)-([XYZ])$`，同对象内不得重名 | `src/core/library-component-loader.ts:38` |
| 挂具位置是积放模式下的唯一真相（`PathTraveler.s`），演示层只能读不能另立来源 | `ADR-0002` 长期约束 |
| 演示层已有逐帧插件与其测试范式 | `src/plugins/models/DemoPaintLine/`、`e2e/paintline-demo-plugins.spec.ts` |

## State Ownership and Compatibility

| 状态 | 归属 | 兼容性 |
| --- | --- | --- |
| KPI 采样与滚动统计 | 新增演示层插件的内存态，不持久化 | 每次加载从零重建；不写入 GLB/项目 |
| 挂具位置 | 仍由 `OverheadConveyor` 的 traveler 拥有 | KPI **只读**，不缓存第二份位置 |
| 机器人关节角 | 各关节 `Drive` 组件 | 新增资产节点，`SprayBooth.glb` 内部结构变化 |
| KPI 文案 | `src/core/i18n/catalogs/` 仅新增 key | 不改名、不删除既有 key |

`SprayBooth.glb` 的内部结构变化只影响涂装线演示自身；该资产没有外部使用者（catalog 中的其余六个对象不引用它）。

## Allowed Paths

- `src/plugins/models/DemoPaintLine/`
- `scripts/build-paintline-library.mjs`、`scripts/build-paintline-scene.mjs`
- `public/library/PaintLine/`、`public/library/catalog.json`、`public/scenes/DemoPaintLine.glb`
- `src/core/i18n/catalogs/zh-CN.ts`、`src/core/i18n/catalogs/en-US.deferred.ts`（仅新增 key）
- `scripts/i18n-verbatim-check.mjs`（仅在 `NEW_STRING_EXEMPTIONS` 声明新增英文文案）
- `tests/`、`e2e/`
- 本计划文件与 `docs/exec-plans/` 下的对应索引

## Forbidden Paths

- `schema/`
- `src/core/`（`src/core/i18n/catalogs/` 的新增 key 除外）
- `src/behaviors/`
- `src/plugins/demo/`（共享图表与假数据插件——见 Non-goals）
- `src/plugins/` 其余目录（`models/DemoPaintLine/` 除外）
- `public/library/PalletHandling/`、`public/models/`

## Milestones

### M1 — 真实节拍与产量 KPI

新增采集插件：在环线上取一个**计数断面**（上下件位），检测挂具跨越该弧长位置，据此得出：

- **节拍**（s）：相邻两次跨越的时间差，滑动平均。
- **产量**（件/h）：跨越次数 × 每挂具工件数，按滑动窗口外推。
- **缓冲段在库量**（件）：位于缓冲段区间内的挂具数 × 每挂具工件数。

配套涂装线专用的 KPI 显示（不复用共享图表），文案走 i18n。

**正例**：关闭放行闸 → 产量下降、在库量上升；重新开闸 → 恢复。
**反例**：链条停止（`Run=false`）时节拍不产生新样本，且不显示上一次的值当作当前值。
**验证**：Node 用例覆盖跨越检测与滑动统计的纯函数（含跨回绕点的情形）；E2E 断言闸开关前后 KPI 数值方向正确变化。

### M2 — 喷房六轴机器人

在 `SprayBooth.glb` 中生成六轴机械臂：`Drive-Rot-*` 关节链（每关节名称唯一）、`RobotIK` 配置及其 `Axis` 引用数组，并把喷枪装在末端。改写喷涂运动插件，由驱动 `Drive-Lin-Y` 改为驱动机器人。

**正例**：机器人随挂具通过而摆动，喷幅始终朝向工件。
**反例**：无挂具通过时机器人回到待机位（该分支在当前链密度下可能不触发，若不触发必须如实登记而非假称已验证）。
**验证**：Node 用例断言资产的关节链完整、`Axis` 引用路径可解析、每个 `Drive-Rot-*` 名称唯一且能被锚定正则解析；E2E 断言关节角随时间变化且画布重绘。

**风险**：`RobotIK` 依赖 `Axis` 的**引用路径**而非命名约定，生成器必须产出与运行时注册表一致的路径。若路径解析不通且修复需要动 `src/core/`，按本计划规则停止 M2、登记缺陷并另立计划，不越界。

## Progress

- [x] M1 真实 KPI —— 2026-08-22 完成，证据见 Validation「M1 实际执行证据」
- [ ] M2 喷房六轴机器人
- [ ] Outcomes 与证据补齐

## Surprises & Discoveries

M1 执行期发现：

1. **固定的「失效秒数」不合理，改为按节拍自适应**。最初用 `STALE_AFTER_S = 30`，但一条一分钟出一件的线，30 秒没读数并不代表停机；而 3 秒一件的线显然已经停了。改为 `max(10 s, 3 × 实测节拍)`——用实测节奏决定什么叫「太久没动静」。

2. **失效判定必须用仿真时间**。首次浏览器验证「停线 40 秒读数没变」，看着像失效规则没生效；实为 SwiftShader 下仿真只跑实时的约 40%，40 秒墙钟才 16 秒仿真，没到阈值。`this.elapsed` 是仿真秒，结论正确，是我的等待时间不够。这与 `EP-CONV-001` 记录的墙钟测速 2.5 倍误差是同一类陷阱。

3. **三条自造的 E2E 错误**，都不在被测代码里：
   - `kpiValue` 返回 `null`（磁贴尚未渲染）时，`null !== '—'` 让轮询**立刻通过**，随后 `Number(null) = 0` 断言失败——一条「等到有读数」的轮询实际上什么都没等。改为轮询到能解析成数字。
   - `KpiCard` 用 CSS 把标签转成大写，渲染出的是 `CYCLE`。中文的「节拍」无大小写，所以中文探测正常、英文断言查不到，表现为「从未测到节拍」。改为忽略大小写匹配。
   - 往复机采样又一次混叠：场景涨到 600 节点后，每次 `readPack` 全场景遍历变慢，采样间隔漂到接近行程周期，九次采样落在同一相位，报「carriage never moved」，而实测位置在 1174 → 5.8 → 1149 之间剧烈往复。改为在页面内用 `requestAnimationFrame` 连续采样，不受往返延迟影响。

4. **节拍与产量必须互相印证，但要用相对容差**。节拍磁贴显示一位小数、产量显示整数，6.735 s 印成 6.7 后反推产量差约 5 p/h。绝对容差会因显示取整而失败；改为 3% 相对容差——仍足以证明两块磁贴出自同一测量，而不是各自的生成器。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因 |
| --- | --- | --- | --- |
| 2026-08-22 | 创建本计划并直接以 `approved / active` 开工 | 用户在会话中的明确指令（「收尾 EP-CONV-001，然后继续 M4 剩下两项」） | 批准来源按 `exec-plans/proposed/README.md` 要求记录于此 |
| 2026-08-22 | KPI 自建涂装线专用组件，不复用 `KpiDemoPlugin` 与共享图表 | Agent 的实施决定 | 前者是明确标注的静态假数据，挂到涂装线上即违反 P0；后者数据源内嵌且由另一个演示共用，改动会外溢 |
| 2026-08-22 | 不做 OEE | Agent 的实施决定 | 可用率/性能/质量需要停机与废品模型，本次无可信数据源；凑数即假数据 |
| 2026-08-22 | 先做 KPI 再做机器人 | Agent 的实施决定 | KPI 不涉及新几何、风险低，且能先给出可观测的产线数字，机器人改动后可用同一组数字确认主线未受影响 |

### M1 实际执行证据（2026-08-22）

| 项 | 命令 | 实际结果 |
| --- | --- | --- |
| KPI 纯函数单测 | `npx vitest run --config vitest.node.config.ts tests/paintline-kpi-math.node.test.ts` | **16 passed** |
| 全部涂装线 / 输送链 E2E | `npx playwright test e2e/paintline-*.spec.ts e2e/overhead-conveyor-render.spec.ts` | **20 passed**（8.2 分钟） |
| 静态 / Node / 治理 / i18n | `./scripts/verify.sh static｜node｜governance`、`npm run i18n:inventory` | 0 / 573 passed / 通过 / 0 |

浏览器实测（`?scene=published:DemoPaintLine`）：

| 时点 | 节拍 | 产量 | 缓冲在库 | 累计 |
| --- | --- | --- | --- | --- |
| 刚加载 | **—** | **—** | 86 pcs | 2 件 |
| 运行 60 s | **6.7 s** | **1069 p/h** | 86 pcs | 12 件 |
| 停线（约 40 s 仿真） | **—** | **—** | 86 pcs | 12 件 |

数值自洽性：环线 145.42 m ÷ 72 挂具 ÷ 300 mm/s = **6.73 s**，与实测 6.7 s 一致；产量 3600 ÷ 6.73 × 2 件 = **1070 p/h**，与实测 1069 一致。**这些数字来自实测而非生成器**，停线后回到「—」而不是保留上一次读数。

**M1 未验证项**：硬件加速环境下的表现；长时间运行（数小时）后时间戳窗口的稳定性；多语言下 KPI 磁贴的布局（仅验证了中英文文案正确，未做窄视口布局验收）。

## Validation

- `./scripts/verify.sh governance` / `static` / `node` / `browser` / `build`
- Node 用例：跨越检测与滑动统计的纯函数（含跨回绕点）；机器人资产的关节链与引用完整性
- E2E：闸开关时 KPI 方向正确；机器人关节角随时间变化
- **渲染层断言**：机器人动作必须以画布字节变化验证——`EP-DEMO-001` 的三个里程碑正是只断言仿真态而全部「通过」却画面不动
- `EP-DEMO-001`/`EP-CONV-001` 交付的既有涂装线 E2E 全部保持通过
- 生成器字节可复现
- `npm run i18n:inventory` 无新增裸字符串
- 浏览器门禁的既有失败需与基线比对后再判定归属

## Rollback

- M1：新增插件与 UI 为纯新增，移除即可；无持久化状态。
- M2：`SprayBooth.glb` 的机械臂由生成器产出，回退生成器代码并重跑两个生成器即可回到往复台车；喷涂运动插件同步回退。
- 无 Schema 变更、无持久化迁移、无外部状态。

## Outcomes & Retrospective

（完成后记录实际结果、验证证据、偏差、未验证项、债务与后续任务。）
