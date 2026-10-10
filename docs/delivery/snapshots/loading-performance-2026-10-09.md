---
doc_id: SNAPSHOT-PERF-001
title: L2-3 加载性能功能与基准交付记录
status: snapshot
owner: engineering
last_reviewed: 2026-10-09
authority: snapshot
---

# L2-3 加载性能功能与基准交付记录

本记录只说明下列版本与测试环境的事实。产品依据为 [PS-PERF-001](../../product-specs/LOADING_PERFORMANCE.md)、[ADR-0014](../../adr/ADR-0014-progressive-loading.md) 和 [性能包契约](../../contracts/PERFORMANCE_PACKAGE.md)，不能用本快照替代正式规格或实机验收。

## 版本与交付范围

PR：[OwnDing/realvirtual-WEB#13](https://github.com/OwnDing/realvirtual-WEB/pull/13)，目标分支 `develop`，基线 `caf7b0eff03e7c260ca7d954370a5954819815c9`。功能提交 `e4d40d7`、取消与兼容修复 `cc0aaa0`、生产流程覆盖 `57d4895`，最终总览视角修正 `a4b3570eb577a3bf851573a8b1f2f2e7e228ea25`。后续交付文档提交不改变运行时代码。

- 显示真实下载字节、未知总量与校验/解码/构建/首帧阶段；支持取消、重试、旧会话隔离，取消未完成的延迟工作后可再次加载。
- 提供本地预处理、受限同源派生包、轻量只读总览、视野优先细化和运行时 LOD；源 GLB、原始几何、NodeId、签名与工业逻辑继续保持权威。总览初始化按模型包围范围与窗口宽高比取景。
- 自动画质只覆盖会话中的 DPR、阴影、AO、Bloom 和 LOD；排除后台、空闲、加载与 XR 样本。设置界面支持高/均衡/流畅/自定义，手动视觉修改退出自动。
- 生产验证接入 required Browser Gate；模型夹具由公开代码生成，不上传客户模型或业务数据。

## 验证记录

| 检查 | 命令与结果 | 范围 |
| --- | --- | --- |
| 治理、架构/Lint、类型 | `./scripts/verify.sh static` 通过；交付文档另执行 `./scripts/verify.sh governance` | 最终视角修正后复测静态检查 |
| Node | `./scripts/verify.sh node`：811 通过，7 个既有跳过；78 文件通过、2 文件跳过 | 本地完整套件；最终实现的远程 Node Gate 也通过 |
| 本地 Browser | `./scripts/verify.sh browser`：1,039 文件 / 10,961 测试通过，12 个既有跳过、2 个 TODO、5 个跳过文件 | `57d4895` 时点，8 分片与独立性能套件；未删除或放宽既有测试 |
| 最终视角与取消回归 | `vitest run tests/performance-loading.test.ts`：7/7 通过 | `a4b3570` 的 6 项完整包围范围投影场景与异步取消资源释放 |
| 构建 | `RV_DEPLOYMENT_PROFILE=offline ./scripts/verify.sh build` 通过 | 主应用、access 与单文件 demo-player；公开源码归档 4,577,156 B，播放器 5,493,424 B，预算未放宽 |
| 生产流程与基准 | `npm run benchmark:performance`：9/9 行为流程 + 30 冷启动 + 30 无包基线 + 30 同页面加载通过，进程退出 0 | `scope: full`，所有流程均检查页面异常为空；资源预算与错误回退硬断言 |
| GPU 驻留采样修正后生产复测 | `npm run verify:performance`：9/9 通过，进程退出 0 | [最终生产报告](loading-performance-production-2026-10-09.json)；8 个 LOD 候选，原始/LOD 两条路径均渲染，4 轮 geometry 均 17、texture 均 5 |

`57d4895` 的 [Quality Gates #106](https://github.com/OwnDing/realvirtual-WEB/actions/runs/37766214086) 五项通过。最终运行时代码 `a4b3570` 的 [Quality Gates #107](https://github.com/OwnDing/realvirtual-WEB/actions/runs/37880831069) 通过治理、静态、Node、构建，以及完整 Browser 单测 **1,039 文件 / 10,967 测试**；随后生产资源检查出现 `14 !== 9`，该轮 Browser Gate 判为失败。

本地复现相反方向的 `[14, 9, 9, 9]`：相机相同、均有 5 个 LOD 代理可见，但 Three.js 按需上传使首次原始几何的 GPU 驻留数量随帧时序变化。生产检查已改为每轮明确渲染正交原始几何与远距离透视 LOD 代理后采样，并断言每一轮的几何、纹理数量都相等、两条渲染路径均实际执行；失败前先保存诊断数据。没有放宽资源阈值。修正只影响验证脚本，不改变本节以下基准使用的运行时代码；最终修正提交的远程结果由 [PR #13 的 Checks](https://github.com/OwnDing/realvirtual-WEB/pull/13/checks) 留证。

## 性能环境与结果

原始 [JSON 报告](loading-performance-2026-10-09.json) 按字节复制自最终 `npm run benchmark:performance` 输出；SHA-256 `d07eae2c77d1b4a1ea892d3aefff224c9cdc630ba397ef34b129e6d5a52af41d`。报告和[首屏截图](loading-performance-2026-10-09.png)均只包含合成数据。

Linux arm64 / Neoverse-N1 / 24,060,334,080 B 内存；Chromium 145.0.7632.0；1920×1080；ANGLE / SwiftShader 软件 GPU。最终生产构建包含 `a4b3570` 的全部运行时代码；构建开始于提交前，主应用版本标签仍为 `57d4895`，demo-player 的源代码归档包含实际构建源码。运行机报告时间为 2026-10-09T04:05:04.167100+00:00，本记录审阅日期为 2026-10-09。

夹具为 48 个节点、1,751,040 个三角形，自包含 GLB 49,810,648 B（49.81 MB）；总览几何与纹理 1,744,284 B（1.74 MB），减少 **96.5%**，小于 3 MiB 预算，无跳过 primitive。总览体积不包含应用脚本、清单或后续细化/原模型流量。

| 指标 | 结果 | 统计边界 |
| --- | --- | --- |
| 首次反馈 P95 | 0.184 s | 冷导航 FCP，30 次 |
| 冷启动总览 P95 | 7.165 s | 导航至总览首次渲染提交，30 次 |
| 冷启动完整就绪 P95 | 12.624 s | 浏览器导航至完整模型首帧，30 次 |
| 关闭性能包的完整就绪 P95 | 11.910 s | 同一构建、相同网络与浏览器时钟，30 次 |
| 模型加载会话 P95 | 8.885 s | 排除应用启动时间，30 次 |
| Playwright 观察导航就绪 P95 | 13.662 s | 含驱动观察延迟，30 次 |
| 同页面重复加载 P95 | 2.497 s | 模块/渲染器已启动；服务 no-store，30 次 |
| 环绕平均帧率 | 1.49 FPS | 10.08 s，15 个 RAF 样本 |
| 环绕帧间隔 P95 | 2079.6 ms | 同一路线 |

冷启动和基线均为 CDP 模拟 100 Mbps / 20 ms，禁用缓存，每轮新建浏览器 context。冷启动 30/30 次在完整源之前展示总览。环绕末帧提交 1,751,044 个三角形，LOD 数量 0，画质模式 `auto` / 档位 2；该路线不构成运行时 LOD 加速对照实验。

独立的 4 次强制总览加载，geometry 计数为 `[49, 49, 49, 49]`，texture 为 `[5, 5, 5, 5]`，LOD 候选为 `[48, 48, 48, 48]`；用户保存的视觉偏好保持不变。画质操作通过受控活跃帧采样验证从高档降级、手动高档接管，并通过真实设置界面将模式改为 `manual`，渲染比例与保存值均为 0.5。

## 口径、偏差与销售材料

本轮在软件 GPU 上未达到冷启动总览 ≤ 5 s 和环绕 ≥ 30 FPS 的规格目标；反馈和完整就绪数据也只适用于本环境。性能包路径完整就绪 P95 比无包基线增加 0.713 s，不得宣称完整加载全面提速。70 项流程记录通过代表功能流程完成，其中包括 30 次冷启动、30 次基线和 1 项含 30 次重复加载的流程，不表示销售性能目标通过。

可用于材料的受限实测陈述为：**“在公开 175 万三角形合成模型基准中，轻量总览资源为 1.74 MB，较 49.81 MB 源模型减少 96.5%，支持先浏览总览、再完成原模型加载。”** 不应删除模型与指标限定，也不能将其改写成任意模型的压缩率、时延或帧率保证。

`salesClaimVerified: false`。≤ 5 s 总览、≤ 20 s 完整就绪和低端 ≥ 30 FPS 仍是待实机验收的目标。本轮完成的是功能、回归与验证工具交付，未批准这些时延/FPS 销售承诺。

支持的流式行为是轻量总览与派生细节分批下载，完整源 GLB 仍需驻留；不是无限规模 out-of-core。可选包准备未完成而源文件已经下载完毕时，立即走完整源路径，因此快速重复加载可能没有 LOD。无包、坏包、过期包、特殊几何、项目内存/blob/带查询参数来源按指南回退；不更改单 HTML 演示格式。

尚未验证真实低端/桌面 GPU、移动浏览器、WebXR、客户模型与实际服务器网络条件；没有连接真实 PLC、设备或生产系统。软件渲染结果不得包装为真实低端设备性能。资源计数稳定只覆盖本次重复加载流程，不能替代长期显存压力测试。

## 复现与回退

依赖已安装且存在 Git LFS 测试资产时，按 [操作指南](../LOADING_PERFORMANCE_OPERATIONS.md) 运行 `verify.sh static/node/browser/build` 和 `npm run benchmark:performance`。实机使用 `npm run benchmark:performance -- --hardware`，核对实际 GPU、设备型号和网络，再对照规格审核至少 30 次结果。硬件选项不会自动设置 `salesClaimVerified`。

部署撤下对应 `.glb.perf.json`，并在画质设置选“自定义”，即可恢复原加载及视觉参数；确认没有其他清单引用后才清理派生摘要目录。代码回退为撤销本 PR 提交，无需迁移或覆盖用户 GLB、项目及工业数据。
