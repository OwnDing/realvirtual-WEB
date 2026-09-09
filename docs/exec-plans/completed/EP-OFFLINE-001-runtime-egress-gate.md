---
doc_id: EP-OFFLINE-001
title: 离线运行与生产零外呼门禁
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-09-09
authority: normative
---

# EP-OFFLINE-001：离线运行与生产零外呼门禁

## Purpose

通过部署预设使用同源资源完成关键操作；CI 同时证明功能成功和没有外呼，并通过故障注入证明检测器有效。

## Scope

部署 offline 预设、启动 CSP、HTTP/Socket/Loader/Worker/外链入口、静态反退化、生产包旅程、隔离网络与 required CI、使用说明。

## Non-goals

file:// 冷启动、PWA 安装、运行中热切断、完整 Appliance/Windows/真实 PLC 验收、服务器自身外呼控制、发布与远程分支保护修改。

## Required Documents and Decisions

GOV-CONSTITUTION、GOV-AI-SAFETY、GOV-DOC-PRIORITY、GOV-CHANGE、GOV-DOD；Accepted ADR-0006/ADR-0008 与 [ADR-0011](../../adr/ADR-0011-offline-runtime-gate.md)；[PS-OFFLINE-001](../../product-specs/OFFLINE_RUNTIME.md)、CONTRACT-DEPLOYMENT-CONFIG-001、CONTRACT-UNIFIED-CONFIG-001。Closed OD-003/OD-005 的安全所有权及 required Gate 名称保持不变。Legacy 生命周期、持久化、Planner、信号、接口和插件文档仅作参考，与代码交叉验证。

## Current Repository Facts

开始于 develop @ 713d19b，工作树干净。已有 deny-external 与 CSP；静态检查仅匹配已知域名；两条 E2E 使用开发服务器且未被 CI 调用。评估的三个 Node 文件 18 例通过。

## State Ownership and Compatibility

安全状态仍由 settings.json 拥有。offline 是既有 egress 策略的部署预设，不增加项目/用户可覆盖的布尔值。GLB、rv_extras、NodeId、项目格式、资产引用、存储 key、信号方向不变。配置通过重新加载生效，不能放宽构建 CSP。

## Allowed Paths

- src/core/**、src/interfaces/**、src/plugins/**、src/main.ts、src/embed/**
- scripts/**、tests/**、e2e/**、playwright.offline.config.ts
- vite.config.ts、index.html、teams-config.html、package.json、eslint.config.js
- .github/workflows/quality-gates.yml、docs/**、public/settings*.json

## Forbidden Paths

- schema/v1/rv-odt.json、schema/v1/specification.md、既有 public/**/*.glb
- 私有 sibling、客户数据、密钥、生成围栏、锁文件

## Milestones

1. 部署预设、CSP 和受控 I/O：授权正例、拒绝前零 I/O 反例。
2. 网络入口和静态反退化：动态 URL 与子资源策略，本地压缩资源可运行。
3. 生产旅程：真实模型、工作区、保存重开，异常配置/远程资源/重定向反例。
4. 检测器 canary、隔离网络、CI、适用全量门禁与文档。

## Progress

- [x] 用户批准范围并建立执行依据。
- [x] 部署预设、CSP、I/O 特征测试与实现。
- [x] 入口与静态反退化。
- [x] 生产旅程、检测器与隔离网络。
- [x] CI、文档、适用全量门禁。

## Surprises & Discoveries

- CONNECT REST、MQTT 和订单外链有未接入集中判定的入口，启动测试未覆盖。
- VitePWA 已禁用，离线指同源部署可用且不依赖外网。
- 构建 GA 注入可能写回 schema v1 并开启外呼，offline 必须优先。
- 生产旅程检出 Teams SDK 在 import 时请求外部配置；现移到配置与 CSP 安装后，且须先获 multiuser 授权。
- Worker 的 CSP 拒绝不会冒泡为页面事件；检测器增加 Chromium CDP Log 监听，专用 canary 验证此路径。
- 真实保存旅程暴露 draft/<id> 被误转成项目文件路径，与既有恢复读取/删除槽不匹配。仅将草稿写回既有 id-keyed OPFS 槽，保留 ID、格式、CAS；补浏览器和文件夹后端的恢复/冲突/清理测试。旧 doc-persistence.md §2.0a 泛称所有可写项目都走 writeScene，未区分草稿，与现有读回/清理语义漂移；本修复以既有 draft/<id> 契约为准，不修改已提交文档的归属。
- 保存后真实刷新暴露组合器把 rvproject: 文档标识传给 new URL 的 Invalid URL 错误。恢复既有项目相对路径语义，保留文档标识与相对/绝对引用格式，增加路径回归和生产保存重开断言。
- 保存后 placement 已固化为 GLB 引用节点，Planner 临时 placed 列表不能作为恢复依据；生产断言使用 composition 中的稳定 NodeId、名称、位置、实际几何和项目文档 ID。保存旅程使用公开 Paint Line 设备，34 MB 默认模型与本地 Draco 解码由独立旅程覆盖。

## Decision Log

2026-09-05 用户明确“同意你的下一阶段定义。帮我全部完成”，批准上轮评估的 WEB 范围。沿用五项 required Gate，将 offline 接入 Browser Gate；不修改远程保护。当时未授权提交、推送、部署或真实设备操作。

2026-09-08 本地验收完成后，用户明确“提交、推送”，授权将本次成果提交并推送到 `codex/offline-runtime-gate` 分支。发布、部署及真实设备操作仍不在授权范围内。

## Validation

聚焦 Node/Browser，verify.sh governance/static/node/browser/build/offline。生产旅程使用本次构建，探针仅指向受控测试目标，保留脱敏报告。

- `RV_DEPLOYMENT_PROFILE=offline ./scripts/verify.sh all` 本地退出 0：治理、Lint、TypeScript、Node **757 通过 / 7 原有跳过**；Browser 八分片 **10,930 通过 / 12 原有跳过 / 2 原有 TODO**，独立性能 **11/11**；生产构建通过。未放宽包体积、性能或超时断言，未增删既有跳过。
- 新增 offline Node 三文件 **26/26**；受影响 Browser 25 文件 **390 通过 / 1 原有 TODO**；保存/路径/分享修复聚焦 **91/91**。全量结果优先于早期调试运行；在线测试夹具显式声明它们模拟的 origin/purpose，不改变被测断言。
- 全量日志：本地 `/tmp/rv-offline-all-final.log`。最终 `node scripts/run-offline-gate.mjs` 在该全量构建产物上退出 0（`/tmp/rv-offline-production-final.log`）；8 条应用旅程全部通过，外呼尝试、页面异常、CSP 违规均为 0；canary 检出 HTTP/图片/脚本/帧/弹窗/XHR/beacon/WebSocket/Worker，以及被 CSP 拒绝的 Worker 外呼。仅 loopback、外部 TCP 探针返回 ENETUNREACH。应用旅程合计约 124 秒，保存重开约 31 秒。
- `test-results/offline/report.json` 记录构建 HTML/settings 的 SHA-256、旅程耗时、本地资源数与外呼结果。失败旅程自动保存 trace，CI 始终上传该目录。报告中的本轮 index 摘要为 `25c08ba5826e003a693cb46879208e9ce780f5eb1a56fa7161c7e078f2b45c0c`。
- `./scripts/verify.sh offline` 为构建加上述隔离运行器的一条命令入口；CI 在 required Browser Gate 复用本次离线构建后调用同一运行器。以上为本地验收证据；远程 CI 尚未验证，功能分支推送后须通过 PR 触发。

## Rollback

回退本任务代码和完整部署目录，不迁移或删除用户数据。恢复在线服务使用显式 allowlist 和同步 CSP，不禁用安全测试。

## Outcomes & Retrospective

2026-09-08 完成用户批准的 WEB 离线范围。offline 构建与重新加载生效的部署策略、受控 I/O、共享 CSP、入口反退化、真实生产旅程、检测器自测、网络隔离及 required CI 配置均已落地。两项既有持久化缺陷由生产旅程发现并修复；没有更改格式、ID、白名单所有权或既有测试门槛。

使用说明见 [OFFLINE_OPERATIONS](../../delivery/OFFLINE_OPERATIONS.md)。上线须由静态宿主实际应用生成的响应头；扩大在线授权需要同步 CSP，受控 HTTP 不跟随重定向。真实 PLC/CONNECT、服务器外呼、独立 embed 宿主、Windows/完整 Appliance、目标服务器部署及远程 CI 未验证。提交与推送依据上述追加授权进行；没有进行发布、部署或真实设备操作。

2026-09-09 后续验证：上述远程 CI 缺口已由 [EP-OFFLINE-002](EP-OFFLINE-002-ci-webgl.md) 关闭。修复隔离运行器的浏览器身份与 WebGL2 初始化后，提交 `4cb7759` 的 [Quality Gates #89](https://github.com/OwnDing/realvirtual-WEB/actions/runs/34349615615) 五项全部通过，包含 8 条零外呼应用旅程、检测器 canary、WebGL2 像素校验、Browser 10,930 条与性能 11 条；其余真实宿主和设备限制仍保留。前文为本计划完成当日的历史证据。
