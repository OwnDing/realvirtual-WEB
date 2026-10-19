---
doc_id: EP-COMPAT-001
title: L3-2 兼容性矩阵与最低配置
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-10-19
authority: normative
---

# EP-COMPAT-001：兼容性矩阵与最低配置

## Purpose

客户 IT 能获得随版本冻结的支持矩阵、最低配置认证状态、离线信任手册及可导出的主动环境报告；每项承诺可追溯到测试证据。

## Scope

矩阵源、纯判定、静态环境检查、诊断入口、双语生成表格/手册、生产验收脚本、现有 CI 门禁接线及实机认证清单。

## Non-goals

不更改 Viewer 渲染/仿真、工业接口、项目存储格式或配置优先级；不部署客户环境、不自动安装证书、不生成虚假最低配置，不把本阶段当作完整 Appliance 的验收。

## Required Documents and Decisions

治理宪法/AI_SAFETY/DOCUMENT_PRIORITY/DoD；Approved [PS-COMPAT-001](../../product-specs/COMPATIBILITY.md)、[矩阵契约](../../contracts/COMPATIBILITY.md)、[验收](../../acceptance/COMPATIBILITY.md)；Accepted [ADR-0018](../../adr/ADR-0018-compatibility-evidence.md)、ADR-0017。继承 Appliance、L2-2、L2-3、L3-1 规格。OD-001 云端范围不涉及；OD-006 旧文档只作经代码验证的参考。

## Current Repository Facts

2026-10-19 从干净 develop / origin/develop `80e4273` 建立 `codex/compatibility-matrix`。现有最低143/已测145声明仅有 Chromium 自动化；L3-1 证据为 Linux ARM64 / Chromium145 / SwiftShader。Vite target=esnext。XR 排除 WebGPU。环境 Node22，已装锁定依赖与 Playwright Chromium；无 gh CLI，PR 使用已连接 GitHub 工具。

## State Ownership and Compatibility

发布矩阵由源码拥有；检查结果仅页面内存，主动检查只临时写自身 OPFS 文件。旧 v1 路径保留保守投影，新 v2 路径独立。GLB/rv_extras/项目/NodeId/许可证/客户存储不迁移。L3-1 包格式与被动采集不变。

## Allowed Paths

- `src/core/compatibility/**`、诊断面板及对应 i18n catalog
- `public/compatibility/**`、`appliance/runtime/static/diagnostics/**`、`appliance/docs/**`
- compatibility 测试/脚本、package scripts、`.github/workflows/quality-gates.yml`、verify 治理入口
- 既有品牌交付投影脚本（将新独立页面纳入既有白标流程）
- 对应 docs 规格/ADR/契约/计划/验收/手册/生成物与索引

## Forbidden Paths

无关业务模块、生成源以外的手工生成物修改、密钥、客户资产、生产配置、项目持久数据。

## Milestones

M1 规格/证据盘点与矩阵契约。M2 Chromium 的矩阵→检查→生产流程→双语文档闭环。M3 扩展实际浏览器 runner、故障/边界/一致性门禁。M4 实机最低配置、企业策略/TLS、XR 认证与发布冻结；缺少资源保持 active，不伪造完成。

## Progress

- [x] 用户批准方案及开 PR 实施，建立干净特性分支。
- [x] 创建规格、ADR、契约和验收定义。
- [x] M2 首个完整闭环：矩阵源、独立主动检查、设置入口、生产 Viewer 流程和双语交付。
- [x] M3 故障覆盖与门禁：范围/证据校验，权限/取消/清理测试，实际 Chrome/Edge runner 和生成漂移检查。
- [x] 本地门禁与生产证据已记录、PR 已创建；首个功能提交远程六项 CI 通过，后续提交由同一门禁复核。
- [ ] M4 Windows Chrome/Edge、真实 GPU/最低配置、企业 TLS/策略、XR 认证。

## Surprises & Discoveries

现有 v1 矩阵无 OS 维度且上界无限，无法诚实表达支持范围；旧运行证据不能覆盖当前构建。L3-1 ADR 禁止主动 OPFS/GPU探测，因此使用独立页面。Appliance 计划仍 active，其未完成实机验收不能借本任务关闭。

静态网络边界门禁要求独立资源也没有未经审计的请求入口，矩阵改为同源静态模块加载，未增加网络白名单。生产测试发现既有自动画质提示会遮挡设置入口，旅程通过正常点击确认继续；新页面默认品牌使用半透明 surface，补上不透明背景并验证文字对比度。Windows 依赖失败时，required Browser Gate 显式失败，避免依赖导致 skipped 被误当成通过。

## Decision Log

2026-10-19：用户批准上一轮完整方案及“开 pr 实施”，据此接受 ADR-0018 并激活本计划。实机不可用时保留未验证状态，不缩减认证标准。

## Validation

运行 `./scripts/verify.sh governance|static|node|browser|build`、新增聚焦测试、生产 compatibility 脚本和受影响诊断生产旅程。生成检查验证文档/资源漂移；CI 的既有 required Browser Gate 依赖 Windows Chrome/Edge 实际通道生产冒烟，并运行 Linux Chromium 检查。Windows 托管 runner 使用软件 GPU，仅作实际浏览器功能证据；不更改远程分支保护。硬件认证单列，不用软件渲染代替。

## Rollback

撤销本变更的应用入口与独立模块，修改矩阵源后重新生成投影。不改写用户业务文件；临时 OPFS 文件由检查 finally 释放。证据保留供追溯。

## Outcomes & Retrospective

已开 [PR #17](https://github.com/OwnDing/realvirtual-WEB/pull/17)，工程实现、完整本地覆盖及首轮远程门禁见[交付快照](../../delivery/snapshots/compatibility-2026-10-19.md)。实际 Windows Chrome/Edge 生产流程通过，但托管软件 GPU 不支持晋升实机最低配置承诺；M4 保持未完成。没有发布、部署或迁移客户数据。
