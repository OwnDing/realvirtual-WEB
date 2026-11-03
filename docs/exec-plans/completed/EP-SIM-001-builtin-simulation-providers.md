---
doc_id: EP-SIM-001
title: 缺口整改第 5 步：自研机器人 IK、刚体机构求解与 CSG 加工
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-11-03
authority: normative-process
---

# EP-SIM-001：缺口整改第 5 步：自研机器人 IK、刚体机构求解与 CSG 加工

## Purpose

完成后，公共构建中的机器人可以交互拖动 IK 目标、按直线（LIN）运动并显示可达性；GLB 中的刚体机构（连杆、闭环）随驱动运动；加工工件随刀具运动被去除材料。许可构建继续使用其私有提供者。

## Scope

- 5a IK：`ik-builtin/`（场景链 FK、Paden–Kahan 闭式解、阻尼最小二乘、作者坐标系），`solvePieper` 可选链参数与 `poseInBase`/`chainFor` 钩子，`src/plugins/builtin-providers.ts` 注册。
- 5b CSG 加工：Worker 内 SDF 网格、刀具扫掠减法、Marching Cubes 块网格、`MachiningProvider` 实现。
- 5c 刚体机构：拓扑、约束求解、组件工厂、`KinematicManagerLike` 与 `MechanismUiBridge`（列表/校验/点动/重建），MCP 工具的诚实可用性随之更新。

## Non-goals

- 逆动力学力分析（`MechanismBody` 质量属性只读入，力快照报告关闭）。
- IK 连续混合（`canBlend`）、与 Unity 分支编号逐一对应。
- DualContouring 网格与折边分裂（退化为 Marching Cubes）。
- 替换许可构建中的私有提供者。

## Required Documents and Decisions

[ADR-0026](../../adr/ADR-0026-builtin-ik-mechanism-machining-providers.md)；用户在缺口整改计划中选择“全部自研”（2026-11-01，“用户当前明确指令”）；入口体积预算（`tests/bundle-splitting.test.ts`）；ADR-0022（不新增依赖）。

## Current Repository Facts

- 起点：分支 `claude/remed-step5-mechanics` 叠在第 4 步提交 `35580ab` 之上（第 4 步 PR 待推送）。
- 三个提供者槽位在公共构建中均为空；`src/private-stubs/` 下对应文件仅供测试辅助类型检查。
- `RVRobotIK.getJointChain()` 已从场景图导出关节链；私有测试 `tests/ik-cobot.test.ts` 含 Unity Burst 验证过的 CRX 黄金用例。

## State Ownership and Compatibility

提供者只持有运行时状态（求解缓存、Worker 内网格），不新增持久化格式。GLB/`rv_extras` 格式不变；`solvePieper` 新参数为可选，私有提供者不受影响。

## Allowed Paths

`src/core/engine/ik-builtin/**`、`src/plugins/builtin-providers.ts`、`src/core/engine/rv-ik-solver.ts`、`src/core/engine/rv-ik-path.ts`（调用点）、`src/plugins/ik-*.ts`（调用点）、`src/core/engine/machining-builtin/**`、`src/core/engine/mechanism-builtin/**`、`src/plugins/mcp-bridge/**`（可用性说明）、`src/main.ts`（一处注册）、相关 `tests/**`、`docs/**`。

## Forbidden Paths

GLB/`rv_extras` 格式、提供者公共接口的既有字段语义、入口体积预算、`package.json` 依赖。

## Milestones

1. 5a IK 提供者与回归测试。
2. 5b CSG 加工提供者与回归测试。
3. 5c 刚体机构提供者与回归测试。

## Progress

- [x] 5a IK：实现与测试（见 Validation）。
- [x] 5b CSG 加工：实现与测试（见 Validation）。
- [x] 5c 刚体机构：实现与测试（见 Validation）。
- [x] 远程 CI 与合并（见 Outcomes & Retrospective）。

## Surprises & Discoveries

- 解析 Pieper 的 OPW 约定（`ElbowInUnityX`、轴反向、Unity→glTF 转换）无法在缺少参考实现的情况下证明正确；场景链在调用点就有，因此闭式解改为在链的 POE 模型上推导，任何坐标约定都由链本身携带。
- 伸展较远的位姿中，带肩偏置的机器人后肩分支本就够不到；8 个槽位中只有 4 个可达是正确结果，测试据此区分紧凑与伸展位姿。
- 用演示模型 `DemoRobotIK.glb` 做与 Unity 的对照时，球形手腕的 IRB2400 全部目标位姿都被精确求解，但最近解与 Unity 烘焙角度相差约 145°。排查发现该机型的 TCP 与目标节点带负缩放/半缩放：`targetPoseInBase` 与 `getJointChain()` 用节点自身缩放去除平移、并以矩阵分解取旋转，导致位置镜像/加倍、旋转相差 180°（CRX 为单位缩放，不受影响）。改为提供者钩子 `poseInBase`/`chainFor`，内置提供者使用“作者坐标系”（本地四元数之积 + 真实世界位置）后，Unity 烘焙角度以 0.0° 复现全部目标；许可提供者的输入保持不变。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-01 | 三项能力全部自研 | 用户在缺口整改计划中的明确选择 |
| 2026-11-03 | IK 闭式解在场景链上推导，`solvePieper` 增加可选链参数 | ADR-0026 |
| 2026-11-03 | 内置 IK 使用作者坐标系（提供者钩子 `poseInBase`/`chainFor`），许可提供者输入不变 | 与 Unity 烘焙角度的对照结果 |
| 2026-11-03 | 第 5 步在第 4 步分支之上继续，按子步骤分别提交 | 第 4 步分支尚未推送；用户指令“继续” |

## Validation

### 5a IK（macOS arm64，2026-11-03，提交前）

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（189 份受治理文档） |
| `./scripts/verify.sh static` | 通过 |
| `./scripts/verify.sh node` | 91 文件 / 924 条通过；网关 21 条通过。新增 `ik-builtin`（9）：两种机器人链（Z 向上；glTF 式基座旋转 + A1/A4/A6 反向 + 旋转腕部坐标）各 40 个随机位姿的闭式往返（原始关节角误差 < 1e-4°，所有可达解 FK 误差 < 1e-6 m / 1e-6 rad）；紧凑位姿 8 分支、伸展位姿仅前肩 4 分支；超程与关节限位不可达；无链全部不可达；无 TCP 节点时 OPW 刀具偏移沿法兰法线；合成非球形手腕往返与热启动回显；**FANUC CRX 黄金用例（Unity Burst 验证值）在 0.5° 内复现**；注册表 tier=`pro` 并转发链 |
| `./scripts/verify.sh build` | 通过；入口 3,519,457 字节（预算 3,520,000），求解器位于独立 chunk `builtin-providers-*.js` |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过；既有 `ik-tier`、`rv-ik-path`、`plugin-toggle-gizmos`、`embed-dispose-leak`（47 条）在新签名下通过 |

补充（作者坐标系修正后）：新增浏览器测试 `ik-builtin-glb`（4）——加载 `DemoRobotIK.glb`，ABB IRB2400（闭式）与 FANUC CRX（数值）的每个带烘焙 AxisPos 的目标都被精确求解（FK 误差 < 0.1 mm），且存在与 Unity 烘焙角度相差 < 3° 的解；CRX 以烘焙角度热启动收敛为单一邻近解。既有 IK 浏览器测试 51 条通过；入口 3,519,659 字节。

未验证（需实机/真实模型）：交互拖动目标与 LIN 运行的人工体验（私有 `ik-cobot-glb-chain` 的 LIN 路径测试依赖私有 WASM，公共构建跳过）。

### 5b CSG 加工（macOS arm64，2026-11-03，提交前）

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过 |
| `./scripts/verify.sh static` | 通过；6 处提供者内部错误登记为 `internal-contract`，机加工 Worker 在 `network-boundary-review.json` 审计（同源打包模块 Worker，无网络传输） |
| `./scripts/verify.sh node` | 93 文件 / 936 条通过。新增 `csg-kernel`（6：Box 格点几何与实体数精确等于 29³、封闭网格毛坯体素化等同 Box、球体与扫掠胶囊去除体积误差 < 7%/10%、重复切削去除 0、刀具 SDF 在约定坐标系下的取值、毛坯与切削后网格封闭且一致朝外、只标记被触及的块）、`machining-builtin`（6：初始网格分批 ≤16 块并以空闲 ack 结束、按序 ack、积压上限 8、只重建被触及的块、复位屏障与新纪元、销毁幂等、Worker 异常失效闩锁、超段数降低子步；以及通过真实 `MachiningManager`/`MachiningVolume`/`MachiningTool` 端到端替换毛坯网格并切削） |
| `./scripts/verify.sh build` | 通过；Worker 独立产物 `csg-worker-*.js`，入口 3,519,706 字节 |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过；新增 `machining-builtin-glb`（3）：在**真实模块 Worker** 中加载 `DemoCSGMachining.glb` 的两个体积——128×32×128 Box（请求 DualContouring，按 Marching Cubes 提取）与 48×128×48 Mesh 毛坯（顶点均在毛坯包围盒内）——初始网格、Ø20 圆柱切入后去除体素 > 0 且实体数守恒 |

已知限制：被动连杆不带 `Drive`/`Kinematic` 组件的合成模型在合并加载路径中会被静态合批（见 5c），与本步无关；刀具坐标约定未与 Unity 内核逐项比对（ADR-0026）。

### 5c 刚体机构（macOS arm64，2026-11-03，提交前）

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（离线帮助因“打开与导入模型”新增“机器人、机构与加工”一节重新生成） |
| `./scripts/verify.sh static` | 通过；机构诊断文本（仅经 MCP inspect/validate 面向智能体与开发者呈现）在 `i18n-inventory-exceptions.json` 逐条登记理由 |
| `./scripts/verify.sh node` | 94 文件 / 940 条通过。新增 `mechanism-solver`（4）：演示四杆机构初始残差为 0、DOF（驱动曲柄时 0，曲柄自由时 1）与闭环数 1；曲柄每 2° 一个 tick、每 tick 4 次迭代，耦合点与闭式四杆解误差 < 0.1 mm；球铰拖动自由平台；施加值驱动自由转动体；移动副保持姿态只沿轴滑动 |
| `./scripts/verify.sh build` | 通过；入口 3,519,856 字节（预算 3,520,000） |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过。新增 `mechanism-builtin-glb`（4）：`mechanism-fourbar.glb` 经面板桥点动曲柄 10°–55°，各连杆长度保持（0.2/0.5/0.3 m，误差 < 1 mm）且收敛；`mechanism-scissor.glb` 无自由连杆保持收敛；`mechanism-delta.glb` 平台锚点随球铰（< 1 mm），力分析报告 status 1 而不给数值；合并加载路径中连杆仍运动，人为冻结的连杆给出 `LinkFrozen` 警告。`mcp-public-stub-honesty` 新增：仅有内置求解器时机构写入工具拒绝且不追加文档操作、读取工具可用；`mechanism-mcp-inspect`（写入编排）在授权的编辑适配器替身下通过 |
| `./scripts/verify.sh supply-chain`（Node 22.22.2） | `web`、`gateway` 均通过（第 5 步无依赖变化） |

已知限制：逆向跟踪与逆动力学未实现（明确报告）；被动连杆不带 `Drive`/`Kinematic` 的模型在合并加载中会被静态合批；机构编辑（MCP 写入类工具）仍需许可编辑模块。

## Rollback

不注册内置提供者（删除 `main.ts` 中一处调用）即回到原有行为：IK 回放、机构 extras 忽略、工件不加工。

## Outcomes & Retrospective

- 远程：PR [#25](https://github.com/OwnDing/realvirtual-WEB/pull/25) 提交 `8801f87`（叠在第 4 步 `35580ab` 之上；#24 合并后只含 `5a00cd3`、`d97bb4d`、`f307f5a`、`8801f87`），Quality Gates #145（run `41566656199`）七项全部首轮通过（六项 required 与 Windows 兼容性；Browser Gate 含新增 `ik-builtin-glb`、`machining-builtin-glb`、`mechanism-builtin-glb`）。
- 合并：2026-11-03T03:03:30Z 合入 `develop`，merge commit `b5a84d5`。CI 测试的合并结果与合并后 `develop` 的文件树一致（#24 的 merge commit 与 `35580ab` 同树）。合并后 `develop` 推送触发的 Quality Gates #147（run `41569873187`，`b5a84d5`）七项全部通过。
- 公共构建三个提供者槽位均已填充；许可构建的私有提供者优先，行为不变。
- 遗留：机构逆向跟踪与逆动力学力分析、IK 连续混合、DualContouring；刀具坐标约定与 Unity 内核的逐项比对；不带 `Drive`/`Kinematic` 的被动连杆在合并加载中的静态合批（需入口体积预算）；交互拖动 IK 目标与 LIN 运行的人工体验——均需后续计划或实机验收。
