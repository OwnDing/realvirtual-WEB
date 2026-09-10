---
doc_id: EP-OFFLINE-002
title: 离线生产门禁 CI WebGL 启动修复与复验
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-09-09
authority: normative
---

# EP-OFFLINE-002：离线生产门禁 CI WebGL 启动修复与复验

## Purpose

让 PR #10 的 required Quality Gates 在真实 CI 平台上稳定完成 offline first model-and-workspaces 生产旅程，并在 WebGL 前置条件不满足时尽早输出可定位的诊断证据。成功以未放宽现有断言和超时的远程 CI 全部通过为准。

## Scope

- 修正离线生产门禁的命名空间用户身份和浏览器启动配置，使 CI Chromium 能加载自带 GLES 库并初始化 WebGL2。
- 在生产旅程前增加窄范围 WebGL 前置诊断，区分渲染上下文不可用与应用加载、网络外呼、页面异常或 CSP 违规。
- 保留失败 trace 和脱敏诊断产物，并在 PR #10 上重新运行 required Quality Gates。
- 完成后同步本计划的事实、验证证据和结果。

## Non-goals

- 不放宽 90 秒超时、功能断言、零外呼断言、CSP 断言或 required Gate。
- 不删除、跳过、静音或改写测试来隐藏失败。
- 不改变 ADR-0011 确立的 offline 产品策略、白名单所有权、CSP、运行时 I/O 或部署语义。
- 不改变 Three.js 渲染架构，不引入新的渲染后端、依赖、Schema、持久化格式或兼容性契约。
- 不发布、不部署，也不操作真实设备或生产工业接口。

## Required Documents and Decisions

- [开发宪法](../../governance/DEVELOPMENT_CONSTITUTION.md)、[AI Agent 安全规则](../../governance/AI_SAFETY.md)、[文档优先级](../../governance/DOCUMENT_PRIORITY.md)、[变更管理](../../governance/CHANGE_MANAGEMENT.md)和[完成定义](../../governance/DEFINITION_OF_DONE.md)。
- Accepted [ADR-0011：离线部署预设与生产网络验收](../../adr/ADR-0011-offline-runtime-gate.md)继续约束生产旅程、网络检测和 required Browser Gate，不在本任务中改变。
- Completed [EP-OFFLINE-001：离线运行与生产零外呼门禁](EP-OFFLINE-001-runtime-egress-gate.md)是既有实现和本地验收记录；其中远程 CI 明确为未验证项，本计划关闭该证据缺口。

## Current Repository Facts

- 当前分支为 `codex/offline-runtime-gate`，跟踪同名远程分支；PR #10 目标为 `develop`，初始调查基于 head `ecd9c1c`。
- 首次 CI Quality Gates run `34232436321` 中，其余四个 required Gate、Browser 单元测试和性能测试均通过；`offline first model-and-workspaces boot` 在 90 秒超时。
- 保存于 `/tmp/rv-offline-ci-run85/model-and-workspaces.zip` 的失败 trace 记录 `THREE.WebGLRenderer: Error creating WebGL context` 和 `BindToCurrentSequence failed`。该旅程记录的网络外呼、页面错误和 CSP 违规均为 0。
- 最初怀疑遗漏 `--use-gl=angle`；后续 CI 证明补齐参数仍失败，GPU 日志进一步定位到 `libGLESv2.so` 加载被拒绝。恢复 runner 原身份后，run `34349117490` 的隔离生产旅程通过；功能修复提交 `4cb7759` 在 run `34349615615` 完成五项 Gate 复验，全部通过。

## State Ownership and Compatibility

本任务只调整测试浏览器进程的启动配置、诊断和 CI 验证，不新增产品运行时状态。offline 策略仍由既有部署配置和 ADR-0011 拥有。GLB、`rv_extras`、NodeId、项目文档、资产引用、存储、信号方向和已保存场景均不改变，也不需要迁移。

## Allowed Paths

- `playwright.offline.config.ts`
- `scripts/run-offline-gate.mjs`
- `scripts/offline-production-journey.mjs`
- `tests/**`、`e2e/**` 中仅与离线生产旅程启动和 WebGL 前置诊断直接相关的文件
- `.github/workflows/quality-gates.yml`
- `docs/exec-plans/active/EP-OFFLINE-002-ci-webgl.md`
- `docs/exec-plans/active/README.md`
- `docs/delivery/OFFLINE_OPERATIONS.md`
- `docs/acceptance/ACCEPTANCE_MATRIX.md`
- `docs/exec-plans/completed/EP-OFFLINE-001-runtime-egress-gate.md`，仅追加本轮远程复验的后续证据链接
- 完成后仅移动本计划并同步 `docs/exec-plans/completed/README.md`

## Forbidden Paths

- 产品运行时网络策略、CSP、白名单和部署配置语义
- `schema/**`、既有 `public/**/*.glb`、项目文档或持久化格式
- 锁文件、生成围栏、私有 sibling、客户数据和密钥
- 任何通过增加超时、删减断言、跳过测试或取消 required Gate 规避失败的变更

## Milestones

1. 固化失败特征：从 run `34232436321` 的 trace 区分 WebGL 上下文创建失败与应用、网络、页面及 CSP 错误；验证现有诊断不会误报网络成功为渲染成功。
2. 启动配置黄金切片：将确认过的 Chromium WebGL 参数放入离线生产旅程实际使用的启动路径，并用配置级或行为级检查证明该路径生效；无 WebGL 时前置诊断应快速失败并输出能力与启动参数，不等待应用旅程超时。
3. 本地回归：运行聚焦离线门禁及适用 governance/static/browser/build 验证，确认正例、WebGL 不可用反例、零外呼和既有性能门槛保持。
4. 远程复验：提交并推送修复到 `codex/offline-runtime-gate`，在 PR #10 上观察新的 required Quality Gates；只有目标 CI 平台的 offline 生产旅程及其他 Gate 全部通过，才能确认本任务完成。

## Progress

- [x] 记录首次远程 CI 失败、trace 证据和当前启动参数假设。
- [x] 验证离线旅程的最终 Chromium 启动参数与本地 WebGL2 能力。
- [x] 实现最小启动配置修复和 WebGL 前置诊断。
- [x] 完成本地隔离生产旅程、故障注入与治理检查；完整回归由 PR 五项 Gate 继续执行。
- [x] 提交、推送并完成 PR #10 的目标 CI 复验。
- [x] 更新 Outcomes，完成计划并归档。

## Surprises & Discoveries

- 首次远程 CI 的网络外呼、页面错误和 CSP 违规均为 0，而 trace 在渲染器创建阶段报告 WebGL 上下文失败；现有 90 秒旅程超时不足以直接暴露这一前置条件。
- 本地验收通过不能证明托管 CI 的图形栈可用。最初的 `--use-gl=angle` 参数假设不足以解释 CI 失败，后续诊断和身份修复见下列记录。
- 2026-09-09，提交 `2d6a23d` 的远程 run `34323941646` 仍无法创建 WebGL2；新增前置检查约 3 秒内保留了明确错误，四项其他 Gate 通过。该结果否定“只补 --use-gl=angle 就足够”的假设。继续收集 Chromium GPU 初始化日志及同一隔离环境内的默认、WebGL fallback 和软件合成器对照；对照结果不替代必需旅程，也不将原始失败转为通过。
- 2026-09-09，诊断提交 `198bc64` 的 run `34324423421` 确认直接原因：GPU 进程加载 Playwright 自带 `libGLESv2.so` 时被拒绝访问，默认/仅 WebGL fallback/软件合成器三种对照均失败；不是特定 SwiftShader 模式或 90 秒超时问题。下一修复优先用 runner 已授权的 sudo 创建独立网络命名空间、设置 loopback，再用 setpriv 切回原调用用户运行 Node/Chromium，避免给浏览器增加用户身份映射；无 sudo 能力的本地环境保留原非特权命名空间路径。通过实际 UID 断言、仅 loopback 与 ENETUNREACH 探针同时验证身份和网络隔离，不更改宿主权限或安全配置。
- 5.6 子代理审查确认 `chromium.executablePath()` 已返回完整 Chromium，并非误选 headless shell；离线入口补齐 `--use-gl=angle` 与 SwiftShader 配对，保留跨 sudo 的可执行文件路径。真实 WebGL2 前置检查使用 RVViewer 的上下文属性并读回已绘制像素，不回退 WebGL1。
- 清理浏览器或 trace 的异常原本可能覆盖首个失败并阻止报告写入；现在保留原始失败，独立清理浏览器与服务器，且清理失败不能将成功旅程伪装为整轮成功。CI 将生产隔离检查前置到 Browser 单元测试之前，以更早暴露环境错误，测试和超时保持原值。
- 最终只读审查发现 GPU 辅助诊断和 detector canary 的 trace/context 清理仍可能覆盖主错误；补齐独立错误字段与原异常保留，并用三项真实隔离浏览器故障注入验证。没有将辅助诊断成功作为功能成功，也没有吞掉 canary 失败。

## Decision Log

- 2026-09-08：用户已授权将 EP-OFFLINE-001 成果提交并推送到 `codex/offline-runtime-gate`；该授权不包含发布、部署或真实设备操作。
- 2026-09-09：PR #10 首次 Quality Gates 暴露 CI WebGL 启动失败后，用户要求继续修复，并授权本轮必要的提交、推送和 PR 更新。范围限于浏览器测试启动配置、WebGL 前置诊断和生产门禁 CI 复验；不得放宽超时、删除测试或改变产品策略。
- 2026-09-09：在目标 CI 证据出现前，将 `--use-gl=angle` 记录为调查假设，不记录为已验证根因。
- 2026-09-09：GPU 日志确认 GLES 库加载被拒绝后，仅调整隔离运行器：sudo 创建网络命名空间并启用 loopback，随后恢复调用者 UID/GID/附加组/HOME，清空 capabilities 并设置 no-new-privileges。保留无 sudo 环境的 userns 路径；不调整宿主 AppArmor、文件权限或网络策略。
- 2026-09-09：根据模式管理器的完成契约，将切换结果与 activeMode 放在同一次浏览器求值中返回，分别严格断言并保留 canvas 可见性检查，避免独立求值的主线程调度延迟造成误判。

## Validation

- 文档阶段：`./scripts/verify.sh governance`。
- 实现阶段：检查离线运行器最终传给 Chromium 的参数，并覆盖 WebGL 可用正例和上下文创建失败反例。
- 聚焦门禁：运行 `node scripts/run-offline-gate.mjs` 或 `./scripts/verify.sh offline`，保持 90 秒超时和全部功能、安全断言。
- 本次只修改测试脚本、CI 编排和文档，使用 `node --check`、治理检查及真实隔离生产旅程验证；产品生产包未变。远程 PR 仍运行完整 static/Node/Browser/build，不增删既有测试和门槛。
- 生产证据：PR #10 新 Quality Gates run 的所有 required Gate 通过；offline 报告继续显示功能旅程成功，外呼尝试、页面异常和 CSP 违规均为 0。
- 本轮验证范围限于本地 Linux ARM64 与 GitHub Ubuntu x64 的浏览器门禁；真实 PLC/CONNECT、Windows Appliance、部署和生产设备仍未验证。
- 2026-09-09 本地 `node scripts/run-offline-gate.mjs` 退出 0：WebGL2 像素读回、网络检测器 canary、8 条生产旅程全部通过；应用旅程保持零外呼、零页面异常、零 CSP 违规。日志 `/tmp/rv-offline-ci-fix-local.log`，报告 `test-results/offline/report.json`。
- 对实际门禁脚本的临时副本注入 `--disable-webgl`，约 2.9 秒内失败并保留 trace/report；进一步同时注入 trace、browser 和 server 清理异常，原始 WebGL 失败仍保留，清理异常单独记录。注入不存在的 Chromium 路径时也保存启动失败报告，未进入应用旅程。故障注入不改仓库脚本或产品代码。
- 本机带 no-new-privileges，无法执行 sudo 路径；保留的 userns 路径可以初始化 WebGL2、检测器和默认模型。新增实际 UID/EUID、GID/EGID、附加组和 HOME 断言，sudo 路径的 setpriv 清除 capabilities 并设置 no-new-privileges，其实际执行由 GitHub runner 验证。本地一次运行在 commissioning 模式跨页面求值时遇到原有 5 秒 polling 超时，失败 trace 已保留；后续诊断和修复见下一条，未增加超时或删除断言。
- 模式切换 trace 显示 `requestMode('commissioning')` 已返回 true，快照已显示 Commissioning 界面；卡住的是下一次独立 CDP 求值。本地代码契约确认 requestMode 仅在 setMode 完成且 activeMode 相符时返回 true。旅程改为在同一次浏览器任务内等待 requestMode 并返回 activeMode，严格断言请求成功和目标模式相符，随后仍检查 canvas 可见性；未改为绕过 guard 的 setMode，未增加超时。这样避免把浏览器主线程后续绘制的调度延迟误判为模式错误；切换后的响应性性能不在本次离线功能验收中新增承诺。
- 2026-09-09，身份修复 `d8a2bc6` 的远程 run `34349117490` 通过完整隔离生产旅程，其他四项 required Gate 通过；推送后继提交时 Browser 单元测试尚未结束，该轮不计为完整全绿证据。模式断言修正后的本地门禁也退出 0，10 项检查（WebGL2、canary、8 条应用旅程）全部通过；日志 `/tmp/rv-offline-identity-final-local.log`。
- 2026-09-09，5.6 子代理基于最终诊断代码执行三项故障注入：WebGL 不可用加 CDP 创建失败（2.72 秒）；WebGL 不可用加 GPU 查询与 CDP detach 同时失败（2.77 秒）；canary 主错误加 trace/context 清理同时失败（3.02 秒）。均退出 1，report 保留主错误和独立辅助错误字段，未进入应用旅程；证据 `/tmp/rv-offline-fault-injection-current/summary.json`。注入只发生于 `/tmp` 副本。
- 2026-09-09，功能修复提交 `4cb775956e467095c6ec9f2b051a543069a1da32` 的 [Quality Gates #89](https://github.com/OwnDing/realvirtual-WEB/actions/runs/34349615615) 五项全部成功：Governance、Static、Node、Build、Browser。Browser job `102459758710` 证明实际使用 `network-with-caller-identity`，UID/GID 为 1001；WebGL2 renderer 为 `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`。WebGL2、canary 和 8 条应用旅程全部通过；八分片合计 Browser 10,930 passed / 12 skipped / 2 todo，独立性能 11/11。离线证据 artifact `10103807192`；本轮未新增跳过或 TODO。
- Artifact 已下载核对至 `/tmp/rv-offline-ci-run89/report.json`：10/10 passed，Chromium `145.0.7632.6`，WebGL2 像素 `[17,34,51,255]`、GL error 0；8 个应用条目均 externalAttempts=0，passed 同时代表脚本中的页面错误和 CSP 违规零值断言通过。CI 构建 `index.html` SHA-256 为 `522d5cac26c74cea24d607a008b3403b4d817d92559924eaaadc6e7c50e651ee`，`settings.json` 为 `26de5c069f2c719ef3a51d18318ca9d47aa06fdcd2134cecc4dacfd801c60f6f`。
- 归档提交同时包含上述辅助错误保留修复；其窄范围故障注入与 `node --check`、governance 通过，完整远程检查继续由 PR 对最终 head 执行。#89 是功能修复的已完成证据，最终 head 的检查结果以 PR 为准。

## Rollback

回退本任务的测试启动配置、诊断和 CI 编排提交即可；不涉及产品配置、Schema、持久化数据或外部设备状态。若目标 CI 仍无法创建 WebGL 上下文，保留失败产物并继续定位平台能力，不以放宽门禁作为回滚或替代方案。

## Outcomes & Retrospective

2026-09-09 完成。真实 CI 日志将首次 90 秒 boot 超时定位到 Chromium 无法加载 GLES 库；仅补齐 GL 参数不足以修复。隔离运行器恢复 runner 原身份后，WebGL2 像素校验、全部离线旅程与五项 required Gate 在 #89 通过。保留仅 loopback 和 ENETUNREACH 断言，未修改宿主安全策略、超时、功能门槛或产品运行时契约。

同时补齐快速 WebGL2 前置检查、浏览器/GPU/用户身份诊断和主错误保留，避免后续平台失败再表现为无上下文的模型超时。模式切换按现有完成契约返回结果与 activeMode，修复独立浏览器求值的调度误判。初始 GL 参数假设、失败 CI 和本地模式超时均保留为调查证据。

验收范围为 WEB 浏览器离线能力和 Linux CI；实际静态宿主响应头、真实 PLC/CONNECT、服务器外呼、独立 embed 宿主及 Windows/完整 Appliance 仍未验收。运行与回退见 [OFFLINE_OPERATIONS](../../delivery/OFFLINE_OPERATIONS.md)。本任务无需数据迁移，未合并、发布或部署。
