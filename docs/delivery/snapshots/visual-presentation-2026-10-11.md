---
doc_id: SNAPSHOT-VISUAL-001
title: L2-4 视觉呈现交付记录
status: snapshot
owner: engineering
last_reviewed: 2026-10-12
authority: snapshot
---

# L2-4 视觉呈现交付记录

本记录对应 `codex/visual-presentation` 工作树，基线提交 `a6dac31bcf94b7a2fa472532a40e4bb2d84d8b4b`。本地验收时变更尚未提交、推送或部署；2026-10-12 用户随后明确授权提交、推送并合并到 `develop`，后续远程结果以该分支的 PR 与 Checks 为准。产品依据为 [PS-VISUAL-001](../../product-specs/VISUAL_PRESENTATION.md)、[ADR-0015](../../adr/ADR-0015-visual-presentation.md) 和[展示契约](../../contracts/VISUAL_PRESENTATION.md)。

## 交付范围

- 左侧「视觉呈现」面板：五种场景风格、参数微调、项目默认保存重开、个人效果及材质模板 JSON 导入导出，中英双语。
- 十四种基础材质：沿用可编辑资产文档的应用、撤销重做、显式保存和引用保护；不支持的混合选择整体拒绝。
- PNG/JPEG、1080p/4K/当前视口、横方竖取景、纯色及透明 PNG；真实重渲染，保留授权水印，隐藏编辑辅助层。
- 无声三维录像：手动、环绕和导览配方，浏览器支持时 MP4、否则 WebM；倒计时、停止下载、取消、后台停止、三分钟及 256 MiB 限制。
- WebGL 正式默认，WebGPU 可选 Beta；媒体导出需使用 WebGL。复用本地 HDR，无新增运行依赖或远程资源。

操作、存储语义、资源许可与兼容矩阵见[使用说明](../VISUAL_PRESENTATION_OPERATIONS.md)。

## 验证证据

环境：Linux arm64，Node 22.22.2，项目配置的 Headless Chromium，ANGLE/SwiftShader 软件 GPU。测试使用公开库模型及程序化夹具，没有真实设备或客户数据。

| 检查 | 结果与范围 |
| --- | --- |
| 治理与静态 | `./scripts/verify.sh all` 中治理、ESLint、网络/架构边界、TypeScript 全部通过；交付文档另执行 governance |
| Node | 81 文件 / 822 测试通过，包含展示配方、配置及 embed 依赖守卫 |
| 完整 Browser | 8 分片加独立性能套件，1,043 文件 / 10,986 测试通过；保留 5 个既有跳过文件、12 个既有跳过测试及 2 个 TODO，本任务未新增跳过 |
| 生产构建 | 2026-10-12 单独重跑 `./scripts/verify.sh build`，退出码 0；主应用、access、demo-player 全部完成，播放器 5,495,175 B、公开源码归档 4,608,043 B |
| 最终构建产物 | `vitest run tests/bundle-splitting.test.ts` 14/14 通过；现有分包和入口预算断言未变 |
| 聚焦 Browser | 4 文件 / 19 测试通过；实际透明 PNG、4K JPEG 像素、可播放录像、取消/重入/后台/编码错误、材质隔离与撤销、CAS/浏览器后端重开、生命周期与异步恢复冲突 |
| Playwright | `playwright test e2e/visual-presentation.spec.ts --project=chromium --trace on`，1/1 通过，3.4 分钟；公开 GLB 导入 → 铜材质 → 撤销重做 → 保存 → 项目风格/个人模板 → 实际 1080p 图片和视频下载 → 刷新重开 → 材质及效果恢复 |
| 独立 embed | `npm run build:embed` 与现有 `embed-spike.node.test.ts` 4/4 通过；动态块未带入 React/MUI，原守卫未放宽 |

E2E 的模型选取通过中央 selection API，重开通过公共 pending-asset-open 与工作区切换；材质、保存、模板、图片、录像均从可见界面操作。页面异常断言排除浏览器 ResizeObserver 通知，其他异常必须为空。最后的相机偏好与滑块修复由聚焦 Browser 和综合门禁验证；E2E 未在这两项修改后重复。

## 修复过程及偏差

旧 `toolbar-button` 插槽已没有渲染宿主；曾尝试的顶部按钮又被搜索区域遮挡，最终复用 ActivityBar/LeftPanel。软件 GPU 录像时重复执行主循环与捕获绘制，导致停止按钮响应迟缓；录制期间由捕获会话独占渲染调度，固定步长仿真保持原逻辑。保留原 GPU 告警，不用软件渲染结果宣称 30 FPS 性能。

首轮同时执行两个 embed 构建共用 staging 目录，造成 ENOENT，并伴随 Node 限流测试超时；后续串行构建及完整 Node 套件通过。正式 embed 构建还检出既有 resolver → project-store → React/MUI 依赖泄漏：独立库中静态排除不存在的工作区项目查询，保留库与相对路径解析，主应用不变。KD-003 的本地隔离已验证，但独立 CI 强制构建仍待后续任务，不关闭该治理偏差。

没有删除、跳过或放宽既有断言及预算。尚未验证真实硬件 GPU 性能、移动端/Safari/Firefox、Gaussian Splats 混合场景及人工美术验收；目标 30 FPS 不是恒定帧率保证。本地验收时未运行远程 CI，后续远程验证见下文；没有真实 PLC 或生产连接验证。

全量测试在 2026-10-11 完成；2026-10-12 继续收尾时读取外层任务退出码为 143，虽然日志已经记录所有测试及三项生产构建完成，也不把该进程标为成功。已单独重跑生产构建确认退出码 0。完整 Browser 的最低临时盘余量 46.57 GiB、最低可用内存 8.92 GiB。

入口实际 UTF-8 大小为 3,560,538 B；现有预算测试用 `string.length` 计数，值为 3,519,046，低于未调整的 3,520,000 阈值。该门禁剩余 954 个 UTF-16 代码单元，后续功能需要继续注意入口体积，不应把该计数误称为传输字节。

## PR 与并发保存审查修复

2026-10-12，初版提交 `32d68f0` 的 [PR #14](https://github.com/OwnDing/realvirtual-WEB/pull/14) 在 [Quality Gates #110](https://github.com/OwnDing/realvirtual-WEB/actions/runs/38187056548) 五项全绿；Browser Gate 还通过真实隔离网络、HTTPS 访问、单文件演示包及生产渐进加载验证。

合并前处理审查指出的 settingsRef 竞争：首次写入设置文件后，另一标签页可能先为项目建立不同设置引用；清单 CAS 重试不得将其改回本次捕获的默认路径。新增三个 Browser 回归，在原实现均失败，覆盖首次安装前竞争、真实清单 CAS 重试和同路径引用的未知字段保留。修复后四个展示测试文件共 22 例通过。竞争失败保留另一方引用与文件，不报告保存成功；本次先写出的未引用设置文件不自动删除，避免误删其他会话可能正在使用的文件。修复提交的最终远程结果以 [PR Checks](https://github.com/OwnDing/realvirtual-WEB/pull/14/checks) 为准。

## 回退

代码回退时取消 `src/main.ts` 中新增插件注册及相应展示模块变更，继续使用原 VisualTab 和资产保存功能。保留个人模板、项目设置与 GLB；旧客户端可忽略可选 `presentation` 字段。不要删除用户文件作为回退方式。插件属于随模型加载的核心展示集成，单次运行中关闭插件不等同于持久的代码回退。
