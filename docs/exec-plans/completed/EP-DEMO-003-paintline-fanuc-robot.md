---
doc_id: EP-DEMO-003
title: 涂装线喷房换装 FANUC CRX 机械臂
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-22
authority: normative-process
---

# EP-DEMO-003：涂装线喷房换装 FANUC CRX 机械臂

## Purpose

把仓库既有演示资产 `public/models/DemoRobotIK.glb` 中的 **`FanucCRX-10iA_L`** 机械臂提取为一个独立库对象，替换掉 `EP-DEMO-002` 用长方体程序化生成的六轴臂，让涂装线喷房里站的是与 default demo 同级别的精细模型。

用户可观察到的成功标准：

1. 喷房内是那台白色 FANUC CRX 协作臂，外形与 default demo 中一致。
2. 它随挂具通过而摆动喷枪，动作与换装前同样连贯。
3. 涂装线其余部分（链条、积放、变色、KPI、Tour）不受影响。
4. 该机械臂作为 `Paint Line` 分类下的一个部件出现在素材库中，可拖放。

## Scope

- 新增 GLB **子树提取器**脚本：从源 GLB 中取出一个具名节点子树（可排除指定子树），连同其网格、材质、accessor、bufferView 与缓冲区切片，输出为独立的单根 GLB。
- 新增库对象 `public/library/PaintLine/PaintRobot.glb`。
- `scripts/build-paintline-library.mjs`：喷房不再内嵌程序化机械臂。
- `scripts/build-paintline-scene.mjs`：把机械臂作为一个放置并入演示场景。
- `src/plugins/models/DemoPaintLine/spray-motion.ts`：按 FANUC 的实际关节轴向重新映射运动。
- `tests/`、`e2e/`：更新资产与运动断言。

## Non-goals

- **不改动源资产** `public/models/DemoRobotIK.glb`——只读提取。
- **不做网格简化**。用户已选择保留原始顶点属性（约 5.22MB），提取器按原样搬运 accessor，不重建顶点布局。
- **不移植 Schunk EGH80 夹爪**。那是取放用的两指夹爪，涂装线不需要；去掉它同时省下约 8.1MB（夹爪带 `COLOR_0` 与 `TEXCOORD_0`）。
- **不做 IK 解算**。沿用 `EP-DEMO-002` 的决定：关节角由演示层直接给定。
- **不移植第二台机器人** `IRB2400-10`。
- 不改 `schema/v1`、`src/core/`、`src/behaviors/`。

## Required Documents and Decisions

- Completed [`EP-DEMO-002`](../completed/EP-DEMO-002-paintline-robot-kpi.md) —— 被替换的程序化机械臂、喷涂运动插件与其断言
- Completed [`EP-DEMO-001`](../completed/EP-DEMO-001-paintline-demo.md)、[`EP-CONV-001`](../completed/EP-CONV-001-overhead-conveyor-accumulation.md)
- [`../../governance/AI_SAFETY.md`](../../governance/AI_SAFETY.md)、[`../../governance/DEFINITION_OF_DONE.md`](../../governance/DEFINITION_OF_DONE.md)

**不需要 ADR**：不改技术栈、模块边界、状态所有权或任何已发布契约。复用仓库内既有资产，`RobotIK` 契约不变。

## Current Repository Facts

以下经实测（拆解源 GLB 得出，非推测）：

| 事实 | 数值 / 位置 |
| --- | --- |
| 源文件 | `public/models/DemoRobotIK.glb`，6.9 MB，70 节点，23 网格，含两台机器人 |
| 目标子树 | `FanucCRX-10iA_L`：25 节点、10 网格、74 663 三角、约 13.34 MB 几何 |
| 其中 Schunk 夹爪 | 3 网格、22 709 三角、约 8.12 MB（带 `COLOR_0`+`TEXCOORD_0`） |
| **仅机械臂（本次目标）** | **7 网格、51 954 三角、约 5.22 MB**；属性仅 `POSITION`/`NORMAL`/`TANGENT`/`INDICES` |
| 材质 | 6 个：`PlasticBlack`、`AluminiumBrushed`、`PlasticWhite`、`LightGreen`、`PlasticRed`、`PlasticGray`；机械臂部分**不引用贴图** |
| 关节命名 | `A1…A6`——与 `EP-DEMO-002` 生成臂**同名**，`spray-motion.ts` 的查找逻辑无需改 |
| 关节轴向 | `RotationZ → RotationY → RotationY → RotationX → RotationY → RotationX`（生成臂是 `Y→X→X→Y→X→Y`，**运动映射必须重调**） |
| `RobotIK` 配置 | 已含 `WristType`、`Solution`、`Axis` 六项 `ComponentReference`，路径形如 `FanucCRX-10iA_L/A1/A2/…` |
| 运行时路径解析 | 注册表按后缀匹配吸收放置前缀（`EP-DEMO-002` Surprises 第 5 条实测） |

## State Ownership and Compatibility

| 状态 | 归属 | 兼容性 |
| --- | --- | --- |
| 机械臂几何与材质 | 新库对象 `PaintRobot.glb`（提取生成物） | 源 GLB 只读，不修改；提取器可重跑，产物需字节可复现 |
| 关节 `Drive` 与 `RobotIK` | 随子树原样搬运 | `Axis` 引用路径按新根重写，其余字段不动 |
| 喷涂运动 | `spray-motion.ts`（演示层） | 关节名不变，仅轴向映射调整 |
| 场景放置 | `DemoPaintLine.glb` 新增一个放置 | 纯新增；喷房本体放置不变 |

**来源标注**：`PaintRobot.glb` 及其生成器必须在注释与文件级说明中写明其几何来自 `public/models/DemoRobotIK.glb` 的 `FanucCRX-10iA_L`，供后续追溯。

## Allowed Paths

- `scripts/extract-glb-subtree.mjs`（新增提取器）
- `scripts/build-paintline-library.mjs`、`scripts/build-paintline-scene.mjs`
- `public/library/PaintLine/`、`public/library/catalog.json`、`public/scenes/DemoPaintLine.glb`
- `src/plugins/models/DemoPaintLine/`
- `package.json`（仅 `build:paintline` 脚本链）
- `tests/`、`e2e/`
- 本计划文件与 `docs/exec-plans/` 下的对应索引

## Forbidden Paths

- `public/models/`（源资产**只读**）
- `schema/`、`src/core/`、`src/behaviors/`
- `src/plugins/demo/`、`src/plugins/` 其余目录
- `public/library/PalletHandling/`

## Milestones

### M1 — GLB 子树提取器与 `PaintRobot.glb`

提取器输入：源 GLB、根节点名、排除子树名列表、输出路径。输出单根 GLB，保留节点名/变换/rv_extras，重写 `RobotIK.Axis` 路径到新根，缓冲区按实际引用压实。

**正例**：产物可被运行时加载，日志出现 `RobotIK: … axes=6`。
**反例**：源 GLB 逐字节不变；排除的夹爪节点与其网格、accessor 不出现在产物中。
**验证**：Node 用例断言产物的节点集、网格数、三角数、材质名、`Axis` 引用可解析、无夹爪残留；连续两次提取字节一致。

### M2 — 换装与运动重映射

喷房生成器去掉程序化机械臂；场景中把 `PaintRobot` 作为放置摆到喷房内。按 FANUC 实际轴向重映射 `spray-motion.ts`：确定哪一轴做基座偏航、哪一轴做喷枪摆动，并重新标定姿态角。

**正例**：基座跟随挂具、腕部摆动，两轴跨度均可观测。
**反例**：基座偏航不得出现绕远路的整圈甩动（`EP-DEMO-002` Surprises 第 8 条）。
**验证**：E2E 逐轴测量角度跨度（页面内连续采样，避免 `EP-DEMO-002` 记录的采样混叠）；截图人工确认外形与姿态；既有涂装线 E2E 全部保持通过。

## Progress

- [x] M1 提取器与库对象 —— 2026-08-22 完成
- [x] M2 换装与运动重映射 —— 2026-08-22 完成
- [x] Outcomes 与证据补齐

## Surprises & Discoveries

1. **实际体积远小于估算：2.40 MB，而非计划里写的 5.22 MB**。先前的估算按每个 primitive 累加其 bufferView 长度，把多个 primitive 共享的视图重复计了。提取器按实际引用压实缓冲区后得出真实值。用户选的是「保留原始属性」方案，实测代价比预期低一半以上。

2. **源资产里还藏着一条取放轨迹**。首次提取的产物带着 `Robotpath`（`IKPath`）与 `Home`/`Pick`/`PickBefore`/`Place`/`PlaceBefore`（`IKTarget`）——那是 default demo 的取放演示轨迹，与涂装无关，留着会让机械臂去走一条不该走的路径。已一并排除，并由测试断言产物中不含任何 `IKPath`/`IKTarget`。

3. **关节角色只能实测，不能从 `Direction` 字段推断**。该臂的 `Direction` 是 `RotationZ → Y → Y → X → Y → X`（Unity 局部帧），无法直接映射到世界轴。逐轴点动 40° 并读 TCP 世界坐标后才确定：A1 基座回转、A2 肩（垂直位移最大）、A3 肘、A4 腕滚、A5 腕俯仰、A6 工具滚（TCP 在轴上，位置不变）。

4. **底座位置也是量出来的**。home 姿态下 TCP 恒在底座 +X 方向 2.3 m 处，且**任何肩/肘角度都不改变这个 X 偏置**（只有基座回转会）。因此底座必须放在 x = −1.9 才能让喷枪落到轨道边（实测 TCP 世界坐标 0.399, 1.06, 20.079）。原先给程序化臂设的 A2=25°/A3=−35° 姿态偏置在这台臂上是反效果，已去掉。

5. **两个「改名/换位后没跟上」的缺陷**，都不报错、只是静止或异常：
   - 插件按节点名 `Robot` 查找机器人根，而提取后的根叫 `PaintRobot`，查不到就整个 tick early return——机械臂纹丝不动，控制台无任何输出。
   - 基座朝向曾被写成常量「轨道在 −X」。底座从 +1.5 挪到 −1.9 后符号反转，`atan2` 又回到 ±180 跳变，A1 跨度 202°（甩圈重现）。改为由底座 X 的符号**推导**朝向，重定位不会再引入该问题。

6. **`RobotIK` 正确识别为 `NonSpherical`**。CRX 是带腕部偏置的协作臂，与之前程序化臂的 `Spherical` 不同；测试已按实际值锁定。

## Decision Log

| 日期 | 决定 | 批准依据 | 原因 |
| --- | --- | --- | --- |
| 2026-08-22 | 移植 default demo 的 FANUC CRX 机械臂替换程序化生成臂 | 用户在会话中的明确指令（附 default demo 截图） | 现成 CAD 模型的精细度远高于长方体拼装 |
| 2026-08-22 | 保留原始顶点属性，约 5.22 MB；不做网格简化 | 用户在本次会话中明确选择 | 提取器按原样搬运 accessor，不重建顶点布局，风险最低；本仓无现成减面工具 |
| 2026-08-22 | 作为库对象进入 `Paint Line` 目录 | 用户在本次会话中明确选择（「仓库本就分发它」） | 同一 AGPL 仓库内的再利用，来源不变；生成器与库对象中标注来源 |
| 2026-08-22 | 去掉 Schunk 夹爪 | Agent 的实施决定 | 两指夹爪是取放用途，涂装线不需要；同时省下约 8.12 MB |

## Validation

- `./scripts/verify.sh governance` / `static` / `node` / `browser` / `build`
- Node 用例：提取产物的节点/网格/三角/材质/`Axis` 完整性、无夹爪残留、源 GLB 未被修改
- 提取器与两个生成器字节可复现
- E2E：逐轴角度跨度、基座不甩圈；`EP-DEMO-001`/`EP-CONV-001`/`EP-DEMO-002` 交付的既有涂装线 E2E 全部保持通过
- **渲染层断言**：换装后画布仍随机器人动作变化
- 浏览器门禁的既有失败需与基线比对后再判定归属

## Rollback

- 删除 `PaintRobot.glb` 与提取器，恢复喷房生成器中的 `addPaintRobot`，重跑两个生成器即回到程序化臂。
- 源资产从未被修改，无 Schema 变更、无持久化迁移。

## Outcomes & Retrospective

**结果**：涂装线喷房现在站的是从 default demo 提取的真实 FANUC CRX-10iA/L，外形与 default demo 一致；它随挂具通过而回转基座、摆动腕部。新增的通用 GLB 子树提取器可复用于任何「把这棵子树取出来」的场合。

**最终验证（2026-08-22）**：governance 通过 · static 0 · node 573 passed / 7 skipped · 涂装线与输送链 E2E **20 passed** · 提取器与两个生成器字节可复现 · **源资产 `DemoRobotIK.glb` 逐字节未变**。

**交付物**：`scripts/extract-glb-subtree.mjs`（通用提取器）· `scripts/extract-paintline-robot.mjs`（本次调用，含来源与排除理由）· `public/library/PaintLine/PaintRobot.glb`（16 节点 / 7 网格 / 6 材质 / 2.40 MB）· 喷房与场景生成器更新 · `spray-motion.ts` 重映射 · 资产断言更新（含来源与无夹爪/无 IK 轨迹）。

**体积**：`public/library/PaintLine/` 由约 70 KB 增至 **2.5 MB**，其中机器人 2.40 MB。低于计划预估的 5.22 MB，原因见 Surprises 第 1 条。

**偏差**：无。计划范围内完成；用户选择的「保留原始顶点属性、不做简化」得到遵守（提取器从不改写顶点数据）。

**最值得记取的一条**：本轮六个发现里有四个是「**换了名字/换了位置，某处没跟上，而系统一声不响**」——根节点改名让整个运动逻辑 early return，底座换位让写死的朝向常量符号反转。两者都不抛异常、不打日志，只表现为「不动」或「动得离谱」。把常量改成**从现场推导**（朝向由底座坐标推出、关节角色由实测确定、体积由实际引用压实得出）是唯一可靠的解法。

**遗留债务**：
- **喷幅可视化丢失**：提取的机械臂没有喷雾锥体网格，`spray-motion.ts` 的喷幅显隐逻辑现在找不到目标（优雅降级，无报错）。要恢复需由插件在运行时给 TCP 挂一个锥体，或在提取产物上后处理追加。
- 承自前序计划：积放的 DES 支持、`Conveyor` glob 重叠、`SpacingController` 大规模性能、`RobotIK` 逆解未使用、「无挂具时回待机位」分支未触发验证、`doc-layout-planner.md` §4.1 文档漂移。

**未验证项**：硬件加速环境下的画质与性能（全部证据来自 SwiftShader）；2.40 MB 资产对首屏加载时间的实际影响未计量；提取器对带蒙皮/形变目标的子树会直接报错退出（未支持，已在代码中显式抛出而非静默产出坏数据）。
