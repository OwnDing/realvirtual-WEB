---
doc_id: ADR-0026
title: 自研 IK、刚体机构与 CSG 加工提供者填充公共提供者槽位
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-03
authority: normative
---

# ADR-0026：自研 IK、刚体机构与 CSG 加工提供者填充公共提供者槽位

## Context

三项仿真能力在公共构建中只有“插槽”，没有实现：

- **机器人 IK**：`ikSolverRegistry`（`src/core/engine/rv-ik-solver.ts`）在许可构建中由私有 Rust→WASM 求解器注册；公共构建 tier 为 `'none'`，只能回放导出时烘焙的 AxisPos，无法交互拖动 IK 目标、无法做 LIN 直线插补和可达性检查。
- **刚体机构**（`KinematicMechanism`/`KinematicJoint`/`KinematicTarget`/`MechanismBody`）：`setKinematicManager()` 槽位为空时，GLB 中的机构 extras 被忽略。
- **CSG 加工**（`MachiningVolume`/`MachiningTool`）：`machiningRegistry` 为空时工件保持原样，不去除材料。

`src/private-stubs/` 下对应文件只是让类型检查通过的空壳。缺口评估（2026-11-01）把它们列为第 5 步；用户明确选择“全部自研”（“用户当前明确指令”，2026-11-01）。

## Decision

1. **实现公共契约，不替换契约。** 自研代码实现既有的 `IKSolverProvider`、`KinematicManagerLike`/`MechanismUiBridge`、`MachiningProvider` 接口，在 `main.ts` 的 `registerPrivatePlugins()` 之后由 `src/core/engine/builtin-providers.ts` 注册，并且**只填仍为空的槽位**——许可构建的私有提供者始终优先。全部作为独立 chunk 懒加载，不增加入口体积。

2. **验证优先。** 每个提供者只报告自己能证明的结果：IK 解经正向运动学复核且满足关节限位才标记 `reachable`；机构求解报告真实残差与收敛标志；加工只在 SDF 网格上做体积可计数的减法。无法证明时报告“不可达/未收敛/不可用”，由调用方回退到原有行为（AxisPos 回放、不移动、工件不变）。

3. **IK：以场景链为准，而不是猜测 OPW 约定。**
   - `solvePieper` 增加可选参数 `chain`（`RVRobotIK.getJointChain()`，与场景同一坐标系）；私有提供者可忽略。三个调用点传入链。
   - 球形手腕：由链导出指数积（POE）螺旋轴，用 Paden–Kahan 子问题（腕心、肩、肘、腕）闭式求解，返回 8 个分支槽位（肩 × 肘 × 腕），每个分支用链 FK 复核；需要 A2∥A3、A4–A6 交于一点。
   - 非球形手腕（`solveCobot`）：在同一 FK 上做阻尼最小二乘（Levenberg–Marquardt），先用热启动，再用“最佳拟合腕心”的闭式分支、镜像种子与 Halton 准随机种子。
   - 无链时所有槽位不可达。无 TCP 节点时，OPW `toolOffset` 仅沿法兰法线（A6 轴，背离腕心）的 z 分量生效，x/y 无法映射而忽略。
   - 提供者声明 `tier = 'pro'`（无机器人数量限制、支持 Cobot），`canBlend = false`（未实现连续混合）。

4. **CSG 加工：TypeScript Web Worker 中的 SDF 体素网格。** 毛坯（Box/Cylinder 解析、Mesh 体素化）初始化为有符号距离场；刀具扫掠按契约的刀具形状求 SDF 并做 `max(sdf, −tool)` 减法；脏块（16³）用 Marching Cubes 重建网格并按批回传。`DualContouring` 与折边分裂在本实现中退化为 Marching Cubes + SDF 梯度法线，并在文档中说明。只有一个计算路径（Worker）；没有 Worker 的环境保持“不可用”。

5. **刚体机构：关节坐标上的阻尼牛顿约束求解。** 由 `KinematicJoint` 图构建拓扑（生成树 + 闭环），驱动关节取 Drive 值，被动关节和闭环约束以阻尼最小二乘每 tick 固定迭代 `SolverIterations` 次求解，写回连杆位姿与 `Converged`/`ResidualError`/`SolveTimeMs`；实现 `MechanismUiBridge` 的列表、校验、点动、重建。逆动力学力分析不在本步范围：快照报告“关闭”，不伪造数值。

## Consequences

- 公共构建获得交互式 IK（拖动目标、LIN、可达性检查）、机构运动与材料去除，许可构建不受影响。
- 结果与 Unity/私有 WASM 的分支选择可能不同（同一位姿的不同但等价解）；调用方按“最接近当前关节角”选择，实际运动连续。
- 求解在主线程（IK、机构）或 Worker（加工）运行，性能低于 WASM；以测试中的规模为准，大型网格需降低分辨率。
- 新增维护面：三套数值代码需要各自的回归测试（FK 复核、体积守恒、约束残差）。

## Alternatives Considered

- **按 OPW 公式直接实现 Pieper**：需要逐一还原 Unity 的坐标/符号约定（`ElbowInUnityX`、轴反向、glTF 转换），缺少参考实现时无法证明正确，否决；改为在场景链上求解并用 FK 复核。
- **引入第三方 IK/CSG/物理库**：增加供应链与许可面（ADR-0022 的逐包判定），且与既有契约的语义（8 分支槽位、块级网格回传）不匹配。
- **继续只保留回放**：与用户“全部自研”的决定不符。

## References

- [EP-SIM-001](../exec-plans/active/EP-SIM-001-builtin-simulation-providers.md)
- `src/core/engine/rv-ik-solver.ts`、`rv-kinematic-registry.ts`、`rv-machining-registry.ts`
- R. M. Murray, Z. Li, S. S. Sastry, *A Mathematical Introduction to Robotic Manipulation*（Paden–Kahan 子问题）
- W. E. Lorensen, H. E. Cline, *Marching Cubes*（1987）
