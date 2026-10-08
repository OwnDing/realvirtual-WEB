---
doc_id: EP-PERF-001
title: L2-3 加载性能与首屏实施
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-10-08
authority: normative
---

# L2-3 加载性能与首屏实施

## Purpose

完成可浏览总览优先、真实加载反馈、受控自动画质、可复现性能门禁并创建 PR。

## Scope

共享加载状态/下载、预处理工具与可选性能包、渐进视觉加载/LOD、会话画质、UI/i18n、测试和性能报告。

## Non-goals

无限 out-of-core 工业运行、云端处理、真实 PLC、发布部署、L2-4 视觉产品化。禁止把尚未实测的目标写成承诺。

## Required Documents and Decisions

[PS-PERF-001](../../product-specs/LOADING_PERFORMANCE.md)、[ADR-0014](../../adr/ADR-0014-progressive-loading.md)、[包契约](../../contracts/PERFORMANCE_PACKAGE.md)、治理宪法/安全/DoD、统一配置和演示包契约。OD-001 云端范围不在本次；其余未决事项不阻断本范围。

## Current Repository Facts

起点 develop caf7b0e，干净工作区，origin=OwnDing/realvirtual-WEB。工作分支 codex/l2-loading-performance。Three 0.185.1；meshoptimizer 1.1.1 已被依赖树锁定。已有 main.ts 字节进度、boot-only auto-quality、BatchedMesh/异步 BVH；perf-smoke 实际断言 FPS>0。

## State Ownership and Compatibility

源模型保持权威；性能包纯派生；加载和自动质量覆盖属于会话。保持旧 GLB/rv_extras/NodeId/项目/单文件演示与工业逻辑兼容。

## Allowed Paths

src/core/engine、src/core/hmi、src/core/i18n、src/core/rv-viewer.ts、src/core/rv-viewer-events.ts、src/main.ts、src/embed、scripts、tests、e2e、schema、docs、package.json/package-lock.json、Vite/Playwright 配置、.github/workflows/quality-gates.yml。

## Forbidden Paths

真实设备配置、密钥、客户资产、私有 sibling、生成文件手工修改。不得推送原始/客户模型；夹具由生成器重建。

## Milestones

M0：文档、基线、Draft PR。M1：普通 GLB 加载反馈黄金切片。M2：预处理、预览/渐进/LOD、错误回退。M3：会话画质与手动覆盖。M4：完整门禁、生产基准、PR交付。

## Progress

- [x] M0 方案批准、仓库检查、文档建立。
- [x] M1 真实反馈与取消。
- [x] M2 性能包、渐进加载与 LOD。
- [x] M3 自适应画质。
- [ ] M4 门禁、基准与 PR。

## Surprises & Discoveries

- 现有性能烟测不强制30 FPS；新性能指标须在独立固定环境评估，不能冒充真实设备。
- 现有 boot auto-quality 明确不运行时调整；本次通过用户批准的显式自动模式扩展，手动设置保持优先。
- 可选包不能阻塞已下载的源模型；准备未完成时取消包，保留完整加载优先级。
- 对无法完整表示的几何/引用场景拒绝发布包；不静默删除 primitive。PNG 解码前校验尺寸。
- 原有信任包装和 clearModel() 守卫保持不变，加载会话用内部清理方法延续所有权。
- 软件 GPU 环境不具备销售延迟/FPS 承诺的硬件证据；提供合成基准、可复现脚本和明确发布条件。

## Decision Log

2026-10-08 用户「同意方案。开 pr 进行开发」批准本计划及对应 ADR，并授权为 PR 提交/推送分支。不授权合并/部署。

## Validation

verify.sh governance/static/node/browser/build，专项 E2E（生产构建、弱网、取消、预览、LOD、资源释放、手动画质）。原始性能基准和优化后数据留档，正式承诺需真实参考机30次测量。适用路径：保存重开、拾取/高亮/运动、离线、旧演示包。

## Rollback

关闭性能包与自动画质会话覆盖；删除明确生成的派生文件即可恢复原路径，不需要业务数据迁移。不回滚用户更改。

## Outcomes & Retrospective

开发中；尚未声明性能承诺或完成。

Draft PR：[OwnDing/realvirtual-WEB#13](https://github.com/OwnDing/realvirtual-WEB/pull/13)。操作与回退见 [交付指南](../../delivery/LOADING_PERFORMANCE_OPERATIONS.md)。当前本地 Node 810 通过、7 条既有跳过；取消/信任/异步批处理专项 Browser 62 通过。全量 Browser 与生产基准继续执行，最终证据将在交付快照记录。
