---
doc_id: EP-SIM-001
title: 缺口整改第 5 步：自研机器人 IK、刚体机构求解与 CSG 加工
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-03
authority: normative-process
---

# EP-SIM-001：缺口整改第 5 步：自研机器人 IK、刚体机构求解与 CSG 加工

## Purpose

完成后，公共构建中的机器人可以交互拖动 IK 目标、按直线（LIN）运动并显示可达性；GLB 中的刚体机构（连杆、闭环）随驱动运动；加工工件随刀具运动被去除材料。许可构建继续使用其私有提供者。

## Scope

- 5a IK：`ik-builtin/`（场景链 FK、Paden–Kahan 闭式解、阻尼最小二乘），`solvePieper` 可选链参数，`builtin-providers.ts` 注册。
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

`src/core/engine/ik-builtin/**`、`src/core/engine/builtin-providers.ts`、`src/core/engine/rv-ik-solver.ts`、`src/core/engine/rv-ik-path.ts`（调用点）、`src/plugins/ik-*.ts`（调用点）、`src/core/engine/machining-builtin/**`、`src/core/engine/mechanism-builtin/**`、`src/plugins/mcp-bridge/**`（可用性说明）、`src/main.ts`（一处注册）、相关 `tests/**`、`docs/**`。

## Forbidden Paths

GLB/`rv_extras` 格式、提供者公共接口的既有字段语义、入口体积预算、`package.json` 依赖。

## Milestones

1. 5a IK 提供者与回归测试。
2. 5b CSG 加工提供者与回归测试。
3. 5c 刚体机构提供者与回归测试。

## Progress

- [x] 5a IK：实现与测试（见 Validation）。
- [ ] 5b CSG 加工。
- [ ] 5c 刚体机构。
- [ ] 远程 CI 与合并。

## Surprises & Discoveries

- 解析 Pieper 的 OPW 约定（`ElbowInUnityX`、轴反向、Unity→glTF 转换）无法在缺少参考实现的情况下证明正确；场景链在调用点就有，因此闭式解改为在链的 POE 模型上推导，任何坐标约定都由链本身携带。
- 伸展较远的位姿中，带肩偏置的机器人后肩分支本就够不到；8 个槽位中只有 4 个可达是正确结果，测试据此区分紧凑与伸展位姿。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-01 | 三项能力全部自研 | 用户在缺口整改计划中的明确选择 |
| 2026-11-03 | IK 闭式解在场景链上推导，`solvePieper` 增加可选链参数 | ADR-0026 |
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

未验证（需实机/真实模型）：带 RobotIK 的真实 GLB 上的交互拖动与 LIN 运行（私有 `ik-cobot-glb-chain` 测试依赖私有模型与 WASM，公共构建跳过）。

## Rollback

不注册内置提供者（删除 `main.ts` 中一处调用）即回到原有行为：IK 回放、机构 extras 忽略、工件不加工。

## Outcomes & Retrospective

（远程 CI 与合并后补齐。）
