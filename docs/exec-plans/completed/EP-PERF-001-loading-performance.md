---
doc_id: EP-PERF-001
title: L2-3 加载性能与首屏实施
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-10-09
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
- [x] M4 门禁、基准与 PR；实机销售性能目标另行验收。

## Surprises & Discoveries

- 现有性能烟测不强制30 FPS；新性能指标须在独立固定环境评估，不能冒充真实设备。
- 现有 boot auto-quality 明确不运行时调整；本次通过用户批准的显式自动模式扩展，手动设置保持优先。
- 可选包不能阻塞已下载的源模型；准备未完成时取消包，保留完整加载优先级。
- 对无法完整表示的几何/引用场景拒绝发布包；不静默删除 primitive。PNG 解码前校验尺寸。
- 原有信任包装和 clearModel() 守卫保持不变，加载会话用内部清理方法延续所有权。
- 软件 GPU 环境不具备销售延迟/FPS 承诺的硬件证据；提供合成基准、可复现脚本和明确发布条件。
- 生产流程用请求门闩等待实际状态，避免固定延时在繁忙机器上错过取消窗口。CI 和完整基准禁止使用单流程筛选。
- 最终截图检查发现细长模型总览取景裁切；按包围球与横/纵视角留白，新增 6 种尺寸/宽高比投影断言。
- CI #107 的全部 10,967 条 Browser 单测通过，但生产 GPU 资源计数比较失败。本地复现首次帧按需上传导致的 9/14 两种驻留量；检查改为每轮都渲染原始几何和 LOD 代理，并对四轮逐一断言相等，保留失败证据。

## Decision Log

2026-10-08 用户「同意方案。开 pr 进行开发」批准本计划及对应 ADR，并授权为 PR 提交/推送分支。不授权合并/部署。

## Validation

已执行 verify.sh governance/static/node/browser/build。Node 811 通过；本地完整 Browser 10,961 通过，最终运行时代码的远程 Browser 单测 10,967 通过；最终视角/取消专项 7 通过。生产构建与 9 项流程通过，30 次冷启动、30 次无包基线、30 次同页加载及环绕测量已归档。修正 GPU 驻留采样后，再次完整执行 9 项生产流程通过；每轮分别渲染原始几何和 LOD 后，几何 17、纹理 5，四轮一致。命令、版本、CI #107 的采样偏差、原始报告与最终 PR Checks 入口见 [交付快照](../../delivery/snapshots/loading-performance-2026-10-09.md)。真实参考机性能承诺尚未验收。

## Rollback

关闭性能包与自动画质会话覆盖；删除明确生成的派生文件即可恢复原路径，不需要业务数据迁移。不回滚用户更改。

## Outcomes & Retrospective

L2-3 本轮功能、验证工具与 PR 交付完成：可选性能包的总览/渐进细化/LOD、真实字节和阶段进度、取消重试、会话自动画质与手动覆盖均有正反例和生产流程验证。源 GLB、原始几何、身份/签名与工业逻辑保持权威，未涉及 L2-4 或发布部署。

[PR #13](https://github.com/OwnDing/realvirtual-WEB/pull/13)；[交付快照与原始基准](../../delivery/snapshots/loading-performance-2026-10-09.md)；[制作、复现与回退指南](../../delivery/LOADING_PERFORMANCE_OPERATIONS.md)。最终提交的 required CI 结论见 PR Checks。

175 万三角形合成模型的总览资源 1.74 MB，较 49.81 MB 源模型减少 96.5%。本机软件 GPU 的冷启动总览 P95 7.165 s、完整就绪 P95 12.624 s、固定路线 1.49 FPS；无包完整就绪 P95 11.910 s。总览与 FPS 未达规格目标，不能将本计划完成解读为实机性能承诺通过。`salesClaimVerified` 仍为 false；参考设备、客户模型、移动浏览器与长期显存压力属于明确未验证项。
