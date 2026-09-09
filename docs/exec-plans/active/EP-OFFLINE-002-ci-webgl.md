---
doc_id: EP-OFFLINE-002
title: 离线生产门禁 CI WebGL 启动修复与复验
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-09-09
authority: normative
---

# EP-OFFLINE-002：离线生产门禁 CI WebGL 启动修复与复验

## Purpose

让 PR #10 的 required Quality Gates 在真实 CI 平台上稳定完成 offline first model-and-workspaces 生产旅程，并在 WebGL 前置条件不满足时尽早输出可定位的诊断证据。成功以未放宽现有断言和超时的远程 CI 全部通过为准。

## Scope

- 修正离线生产门禁所使用的浏览器测试启动配置，使 CI Chromium 获得项目支持的 WebGL 启动参数。
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
- Completed [EP-OFFLINE-001：离线运行与生产零外呼门禁](../completed/EP-OFFLINE-001-runtime-egress-gate.md)是既有实现和本地验收记录；其中远程 CI 明确为未验证项，本计划负责关闭该证据缺口。

## Current Repository Facts

- 当前分支为 `codex/offline-runtime-gate`，跟踪同名远程分支；PR #10 目标为 `develop`，当前调查基于 head `ecd9c1c`。
- 首次 CI Quality Gates run `34232436321` 中，其余四个 required Gate、Browser 单元测试和性能测试均通过；`offline first model-and-workspaces boot` 在 90 秒超时。
- 保存于 `/tmp/rv-offline-ci-run85/model-and-workspaces.zip` 的失败 trace 记录 `THREE.WebGLRenderer: Error creating WebGL context` 和 `BindToCurrentSequence failed`。该旅程记录的网络外呼、页面错误和 CSP 违规均为 0。
- 当前调查发现测试浏览器启动参数可能遗漏 `--use-gl=angle`。这只是待验证假设；尚不能据此断言根因已修复，必须以目标 CI 平台复验为准。

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
- [ ] 提交、推送并完成 PR #10 的目标 CI 复验。
- [ ] 更新 Outcomes，完成计划并归档。

## Surprises & Discoveries

- 首次远程 CI 的网络外呼、页面错误和 CSP 违规均为 0，而 trace 在渲染器创建阶段报告 WebGL 上下文失败；现有 90 秒旅程超时不足以直接暴露这一前置条件。
- 本地验收通过不能证明托管 CI 的图形栈可用。`--use-gl=angle` 的遗漏与失败相关，但真实 CI 平台尚未复验，因果关系仍待确认。
- 2026-09-09，提交 `2d6a23d` 的远程 run `34323941646` 仍无法创建 WebGL2；新增前置检查约 3 秒内保留了明确错误，四项其他 Gate 通过。该结果否定“只补 --use-gl=angle 就足够”的假设。继续收集 Chromium GPU 初始化日志及同一隔离环境内的默认、WebGL fallback 和软件合成器对照；对照结果不替代必需旅程，也不将原始失败转为通过。
- 5.6 子代理审查确认 `chromium.executablePath()` 已返回完整 Chromium，并非误选 headless shell；离线入口补齐 `--use-gl=angle` 与 SwiftShader 配对，保留跨 sudo 的可执行文件路径。真实 WebGL2 前置检查使用 RVViewer 的上下文属性并读回已绘制像素，不回退 WebGL1。
- 清理浏览器或 trace 的异常原本可能覆盖首个失败并阻止报告写入；现在保留原始失败，独立清理浏览器与服务器，且清理失败不能将成功旅程伪装为整轮成功。CI 将生产隔离检查前置到 Browser 单元测试之前，以更早暴露环境错误，测试和超时保持原值。

## Decision Log

- 2026-09-08：用户已授权将 EP-OFFLINE-001 成果提交并推送到 `codex/offline-runtime-gate`；该授权不包含发布、部署或真实设备操作。
- 2026-09-09：PR #10 首次 Quality Gates 暴露 CI WebGL 启动失败后，用户要求继续修复，并授权本轮必要的提交、推送和 PR 更新。范围限于浏览器测试启动配置、WebGL 前置诊断和生产门禁 CI 复验；不得放宽超时、删除测试或改变产品策略。
- 2026-09-09：在目标 CI 证据出现前，将 `--use-gl=angle` 记录为调查假设，不记录为已验证根因。

## Validation

- 文档阶段：`./scripts/verify.sh governance`。
- 实现阶段：检查离线运行器最终传给 Chromium 的参数，并覆盖 WebGL 可用正例和上下文创建失败反例。
- 聚焦门禁：运行 `node scripts/run-offline-gate.mjs` 或 `./scripts/verify.sh offline`，保持 90 秒超时和全部功能、安全断言。
- 本次只修改测试脚本、CI 编排和文档，使用 `node --check`、治理检查及真实隔离生产旅程验证；产品生产包未变。远程 PR 仍运行完整 static/Node/Browser/build，不增删既有测试和门槛。
- 生产证据：PR #10 新 Quality Gates run 的所有 required Gate 通过；offline 报告继续显示功能旅程成功，外呼尝试、页面异常和 CSP 违规均为 0。
- 当前尚未验证目标 CI 平台上的修复效果，也未验证真实 PLC/CONNECT、Windows Appliance、部署或生产设备。
- 2026-09-09 本地 `node scripts/run-offline-gate.mjs` 退出 0：WebGL2 像素读回、网络检测器 canary、8 条生产旅程全部通过；应用旅程保持零外呼、零页面异常、零 CSP 违规。日志 `/tmp/rv-offline-ci-fix-local.log`，报告 `test-results/offline/report.json`。
- 对实际门禁脚本的临时副本注入 `--disable-webgl`，约 2.9 秒内失败并保留 trace/report；进一步同时注入 trace、browser 和 server 清理异常，原始 WebGL 失败仍保留，清理异常单独记录。注入不存在的 Chromium 路径时也保存启动失败报告，未进入应用旅程。故障注入不改仓库脚本或产品代码。

## Rollback

回退本任务的测试启动配置、诊断和 CI 编排提交即可；不涉及产品配置、Schema、持久化数据或外部设备状态。若目标 CI 仍无法创建 WebGL 上下文，保留失败产物并继续定位平台能力，不以放宽门禁作为回滚或替代方案。

## Outcomes & Retrospective

尚未完成。待记录实际启动参数、目标 CI run、各 Gate 结果、与 `--use-gl=angle` 假设是否一致、偏差和剩余平台限制。
