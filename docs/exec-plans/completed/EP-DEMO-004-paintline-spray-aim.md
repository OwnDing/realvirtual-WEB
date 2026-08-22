---
doc_id: EP-DEMO-004
title: 涂装线喷幅恢复与喷枪指向根因修复
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-08-22
authority: normative-process
---

# EP-DEMO-004：涂装线喷幅恢复与喷枪指向根因修复

## Purpose

用户提出两点：**喷幅不见了**，**机械臂在画面中太小**。修复过程中实测发现第三个、也是更严重的问题：喷枪一直**顺着输送方向喷**，而不是对着工件喷。

用户可观察到的成功标准：

1. 喷房内可见喷幅锥，随喷枪运动，挂具离开喷房时消失。
2. 机械臂在画面中与喷房、挂具比例协调，不再像个玩具。
3. 喷枪对着工件喷，而不是对着下游空气喷。

## 关于本记录的时序（如实说明）

本文档是**事后补写**的。开工时用户的诉求是"把喷幅找回来 + 机器人放大"，按 [`CHANGE_MANAGEMENT`](../../governance/CHANGE_MANAGEMENT.md) §1 末句属于"小型、局部、可一次验证和回滚的缺陷修复"，可不建 ExecPlan，当时也是这样处理的。

排查中发现根因在 GLB 子树提取器的输出契约（根节点平移），改动范围随之扩大到"GLB/rv-ODT 变化"这一必须建 ExecPlan 的条目。工作完成并通过全部闸门后补此记录，而不是把已扩大的范围继续按豁免处理。

## Scope

- `scripts/extract-glb-subtree.mjs`：抽取子树时把根节点的**平移**归零（旋转保留），并在 `asset.extras.liftedDonorTranslation` 中留痕。
- `public/library/PaintLine/PaintRobot.glb`：按新契约重新生成。
- `scripts/build-paintline-library.mjs`：喷房加宽以容纳放大后的机械臂。
- `scripts/build-paintline-scene.mjs`：新增 `scale` 支持；机械臂按实测臂展重新定位。
- `src/plugins/models/DemoPaintLine/spray-motion.ts`：运行期构建喷幅锥；修正 A1 偏航约定。
- `e2e/`：新增喷枪指向回归断言；修复两处帧率相关的测量缺陷。

## Non-goals

- **不改源资产** `public/models/DemoRobotIK.glb`。
- **不做 IK 解算**。沿用 EP-DEMO-002 的决定：关节角由演示层直接给定。
- **不改** `src/core/`、`src/behaviors/`、`schema/v1`。
- **不把喷幅锥烘进 GLB**。它是演示层自有的可视元素，随插件生灭。

## Required Documents and Decisions

- Completed [`EP-DEMO-003`](./EP-DEMO-003-paintline-fanuc-robot.md) —— 被修正的提取器与机械臂换装
- Completed [`EP-DEMO-002`](./EP-DEMO-002-paintline-robot-kpi.md) —— 喷涂运动插件与其断言
- [`../../governance/AI_SAFETY.md`](../../governance/AI_SAFETY.md)、[`../../governance/DEFINITION_OF_DONE.md`](../../governance/DEFINITION_OF_DONE.md)

**不需要 ADR**：不改技术栈、模块边界、状态所有权。提取器的输出契约变化只影响本仓库内由该脚本生成的资产，`RobotIK` 契约与 `rv-ODT` schema 均不变。

## Allowed Paths

- `scripts/extract-glb-subtree.mjs`
- `scripts/extract-paintline-robot.mjs`
- `scripts/build-paintline-library.mjs`
- `scripts/build-paintline-scene.mjs`
- `src/plugins/models/DemoPaintLine/spray-motion.ts`
- `public/library/PaintLine/**`、`public/scenes/DemoPaintLine.glb`（生成物）
- `e2e/paintline-scene.spec.ts`、`e2e/paintline-demo-plugins.spec.ts`
- `docs/exec-plans/completed/EP-DEMO-004-*.md`

## Forbidden Paths

- `public/models/**`（源资产只读）
- `src/core/**`、`src/behaviors/**`、`schema/**`
- 其他 demo 的插件包与场景

## Milestones

### M1 — 喷幅恢复

抽取出来的 FANUC 臂来自取放演示，本身没有喷幅网格。在演示层用 `ConeGeometry` 运行期构建，挂到机器人的 `TCP` 节点上。不后处理厂商几何。

### M2 — 机械臂放大

真实尺度下一台 1.4m 的 CRX 在 3.4m 喷房和 145m 输送链旁像个玩具。放大 1.6×，喷房宽度 4.4m → 7.0m。这是**有意为之的取景选择**，记录在案，不冒充真实尺度 CAD。

### M3 — 喷枪指向根因修复

见下节。

## Surprises & Discoveries

### 提取器把捐赠场景的站位一起搬了过来

`PaintRobot` 根节点带着 `translation = [2.149, 0.005, 0.379]`——那是这台机器人在原 `DemoRobotIK` 场景里**站的位置**，不是它自身的构造。

后果是名为"基座"的节点其实在机器人脚下 2.149m 之外的空中：

- 臂自身横向伸展只有 **0.242m**，但基座到 TCP 实测 **3.68m**；
- A1 基座偏航是绕着那个空点在转；
- 每次放置都得手工预减这个偏移（`base_x = 0.4 - 2.3 × 1.6`）。

子树的根平移属于捐赠文件的布局信息，不属于资产。提取时归零，**旋转保留**——关节链沿局部 +Z 嵌套，根旋转是 Z-up→Y-up 的约定，是资产的一部分。

### 喷枪一直在顺着产线喷

A1 偏航用的是 `atan2(dz, dx)`，这个式子把 "A1 = 0" 当成"已经面向轨道"。实测该资产在 A1 = 0 时工具轴指向世界 **−Z**，即正对下游。正确式子是 `atan2(-dx, -dz)`。

实测 14 个采样点，喷幅轴与"TCP→挂具"方向的夹角在 **12°–152°**、中位数约 **93°**——机器人在对着输送方向喷。

这个错误藏了两个里程碑，因为**旁边所有现象都是正常的**：臂在跟踪挂具、腕在摆动、喷幅可见、KPI 在走。没有任何一条断言问过"漆到底喷到哪去了"。这是本项目反复出现的同一条教训——*一个正常的现象足以掩盖旁边不正常的现象*——的第四次实例。

### 两处断言测的是机器强弱，不是机器人行为

修复后 `binds by folder name and moves the booth robot` 开始不稳定地失败：

1. `jointTravel` 按 `requestAnimationFrame` 采样 `currentPosition` 取 min/max。SwiftShader 下只有约 14fps，2.2s 周期的正弦峰值被跳过——渲染几何实测 69.9° 的摆幅，被读成 20°。
2. 改成记录**下发指令**后仍然失败：摆动相位随**仿真时间**推进，固定 8 秒墙钟窗口测的是机器多快。单独跑这个文件时窗口覆盖满幅 70°，跟在另外两个 3D spec 后面跑时只覆盖 21.95°——仿真在 8 秒里只推进了约 0.25 秒。

两处都改掉了：幅度取自 `startMove` 的指令值（不受帧率影响），并且采样**一直进行到动作真正完成**而不是到点收工；实测位移只用来证明驱动确实在跟随。上界断言（防甩臂）仍用固定窗口——欠采样只会少报，不会凭空多报。

## Decision Log

| 决策 | 取舍 |
| --- | --- |
| 喷幅锥在演示层运行期构建 | 不后处理厂商几何；锥体随插件生灭，跟着 TCP 走不用额外代码 |
| 提取器归零根平移而非在放置处预减 | 预减是把资产缺陷摊给每个使用者；归零一次，今后任何抽取都正确 |
| 机械臂放大 1.6× 并加宽喷房 | 取景选择，明确记录，不冒充真实尺度 |
| 偏航从基座而非 TCP 起算 | 从 TCP 起算是循环依赖（TCP 位置本身取决于偏航）。基座起算带来约 16° 的稳态视差偏差，小于喷幅锥约 22° 的半角，工件仍在锥内 |
| 幅度断言取指令值 | 实测值在低帧率下不可测；指令值可测且能捕获真正的回归 |

## Validation

| 闸门 | 结果 |
| --- | --- |
| `./scripts/verify.sh static`（含 governance） | 通过 |
| `./scripts/verify.sh node` | 573 通过 / 7 跳过 |
| `./scripts/verify.sh build` | 通过 |
| `e2e/paintline-scene.spec.ts` + `paintline-demo-plugins.spec.ts` + `overhead-conveyor-render.spec.ts` | 21 通过 |
| 生成物可重现性 | 两次 `npm run build:paintline` 逐字节一致 |

指向修复的实测证据（24 采样）：

- 修复前：喷幅轴恒为 −Z，与挂具夹角中位数约 93°。
- 修复后：喷幅轴恒为 +X（0.77–0.98），水平瞄准误差稳定在 **13°–18°**，俯仰 −35°~+34.5°（正是 A5 的 ±35° 摆幅）。两个跳变点（0.8°、34.9°）出现在最近挂具切换、基座正在过渡时。

新增回归断言 `points the spray gun at the workpiece, not down the line`：断言喷幅锥挂在 `TCP` 上、在挂具通过时可见、水平瞄准误差**中位数** < 25°，且喷枪仍在摆动。取中位数而非最大值——挂具切换时的过渡是真实运动，断言最大值等于把基座的加速度锁死。

## Rollback

单次回滚：还原上述 Allowed Paths 中的源文件并重跑 `npm run build:paintline`。生成物完全由脚本决定，无手工编辑。

## Outcomes & Retrospective

用户提的是两个视觉问题，实测暴露出的是一个功能性错误——喷枪指向错了 90°。两个视觉问题各改一处即可；指向问题要改提取器的输出契约、机械臂站位和偏航约定三处。

值得记下的是**发现方式**：这个缺陷不是看出来的，是因为要给"喷幅回来了"写一条断言、被迫去测"喷幅到底朝哪"才暴露的。截图看起来是对的——喷幅确实从枪口喷出、确实指向工件方向的画面区域。是数字不对。

本项目第四次出现同一模式，也第四次印证同一条对策：**断言必须落在被测的那个量上**（每轴、每方向、渲染输出），而不是落在"有东西在动"这种聚合信号上。
