---
doc_id: EP-DEMO-005
title: L2-2 单 HTML 离线演示导出
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-10-06
authority: normative-process
---

# EP-DEMO-005：L2-2 单 HTML 离线演示导出

## Purpose

从已编辑文档编排相机导览，一键下载可交给销售、在断网现场双击运行的单 HTML。

## Scope

当前文档导出能力、导览编排/配方保存重开、嵌入引用快照、预检、独立播放器构建、双语操作与 file:// 生产验收。

## Non-goals

任意脚本导览、完整工作台/HMI/工业接口、云端/组织模型、离线撤销、自动上传部署、真实设备操作。

## Required Documents and Decisions

治理宪法、AI 安全、文档优先级与 docs 索引；[产品规格](../../product-specs/DEMO_PACKAGE_EXPORT.md)、[ADR-0013](../../adr/ADR-0013-single-file-demo-package.md)、[格式契约](../../contracts/DEMO_PACKAGE.md)、既有 ADR-0006/0008/0011/0012。OD-001 的组织/服务器剩余闸口不涉及本次纯客户端产物；不关闭任何 OD。旧 persistence/lifecycle/plugin/UI 文档只作 reference 并交叉验证。

## Current Repository Facts

2026-10-06 develop@950114a，工作区干净，fetch 后建立 codex/l2-demo-export。已有 Kiosk 代码导览、声明式类型与 embed director；只有 .glb/.rvproject 导出，没有单文件播放器。scene 的 flat 导出使用 live tree，而标准 asset 导出已有 clone/运行时清理；新导出须避免泄漏仿真对象与修改 live 引用标志。

## State Ownership and Compatibility

导览属于显式配方/导出产物；不隐式修改源文档或用户配置。GLB 来自当前文档写入方；嵌入快照仅修改导出克隆。保持 NodeId、rv_extras 与项目身份。

## Allowed Paths

src/core/demo-package/**、src/demo-package/**、DocumentCard/ActiveDocumentView 与当前文档适配器、标准 asset GLB exporter 的可选能力、i18n、构建与验证脚本、tests/**、docs/**、必要 package/Vite/CI 配置。

## Forbidden Paths

真实客户数据、生产配置/设备、现有签名信任根、工业写逻辑、生成文档围栏、私有 sibling。

## Milestones

1. 文档与版本化配方/模型预检；独立播放器生产构建。
2. 当前文档快照→单 HTML→断网 file:// 黄金切片。
3. 导览面板、镜头编辑与配方重开、双语、取消/切换与失败路径。
4. 自动化回归、构建、运行手册与验收证据；按已有授权范围交付代码。

## Progress

- [x] 用户确认单 HTML；新建功能分支并记录规格/ADR/契约。
- [x] 配方、快照与模型预检。
- [x] 播放器/构建与导览编辑 UI。
- [x] 正反例、真实 file:// 冷启动和适用门禁。
- [x] 文档与本地功能交付；按用户追加授权提交、推送并创建合入 develop 的 PR。

## Surprises & Discoveries

独立源码重建发现绝对 glob 仍可能依赖命令工作目录，已在独立 Vite 配置中固定 root；源码审计拒绝树外的生产源文件。独立 library 构建需显式固定 process.env.NODE_ENV=production，避免浏览器启动时残留 Node 全局引用。SceneStore 的 RvDocument 实例跨场景复用，导出能力改用当前模型根节点作为会话身份，防止文档切换后沿用旧面板。

现有 offline 门禁不承诺 file://，本次必须独立验证。Kiosk TypeScript tour 的闭包与 HMI 原语不能直接移植；首版导出明确采用便携相机/文本子集，不假装支持全部旧导览。

## Decision Log

2026-10-06 用户要求开分支推进 L2-2，并通过选择题明确单 HTML 双击离线打开。便携配方、构建与预检实现选择依据当前契约和任务范围；不代表用户另行批准云端、部署或任意代码执行。

2026-10-06 本地验收完成后，用户明确要求“开pr，提交、推送”，授权将本功能提交到当前功能分支并创建合入 develop 的 PR。

## Validation

2026-10-06 本地验证：

- `./scripts/verify.sh static`：governance、外部源/网络边界、ESLint、社区 TypeScript 通过。期间一轮检查随交互中断（143），重新完整运行退出 0；不计中断为通过。
- `./scripts/verify.sh node`：76 个文件、795 个用例通过；既有 2 文件/7 用例跳过状态不变。初次发现 2 处语言选项硬编码，修正为显式语言的 Intl.DisplayNames 后全量通过。
- `./scripts/verify.sh browser`：8 组及独立性能组均退出 0，共 1,038 文件、10,957 用例通过；既有 5 文件/12 用例跳过、2 todo 不变。新增导出引用/材质/NodeId、面板编排/重开/错误/取消/切换/卸载覆盖通过。
- `./scripts/verify.sh build`：公共工作台、受保护演示与单文件播放器构建退出 0。播放器最后修复首次点击上一镜头的索引与独立构建 root 后，`npm run build:demo-player` 及以下真实浏览器验证再通过。
- `node scripts/test-demo-package.mjs`：真实生产 IIFE、全新断网上下文、file:// 冷启动；52,003 个来自内嵌 PNG 纹理的绿色几何像素，镜头变换、完成/接管/初始视角/上一镜头、配方与源码下载、HTML 注入及无效版本均通过，外部网络尝试 0，浏览器错误 0。
- `node scripts/test-demo-package-authoring.mjs`：`/demo-base/` 子路径生产工作台中实际从文档卡打开面板、录制镜头并下载 HTML；接收者断网 file:// 播放通过，外部网络尝试 0、浏览器错误 0。软件渲染并行负载曾导致截图超时，串行重跑原断言通过，未跳过流程。
- 将随包源码解压到独立临时目录，复制已安装依赖（不安装/不改锁文件），从仓库外的绝对脚本入口重建，产出的播放器 SHA-256 与交付构建完全相同；不依赖私有 sibling。源码归档成员和许可证也在 file:// 验收脚本中检查。
- 证据：`test-results/demo-package/result.json`、`authoring-result.json`、`source-rebuild-result.json`、生产 UI/接收端截图及 HTML；本地过程日志 `/tmp/rv-demo-*.log`。CI 已接入两项离线验收及证据上传；上述为本地验证，远程 CI 结果以 PR 检查为准。

## Rollback

回退本功能提交即可移除新增入口与构建模块；无项目迁移。已导出文件独立，配方保留以便新版重导。本次交付范围包括提交、推送和创建 PR，合并与部署另行执行。

## Outcomes & Retrospective

L2-2 首版在 `codex/l2-demo-export` 完成本地交付：文档卡入口、便携配方、克隆快照、预检与单 HTML 播放器形成完整闭环。操作说明见 [演示导出运行手册](../../runbooks/DEMO_PACKAGE_EXPORT.md)。

偏差：完整 TypeScript Kiosk 导览未序列化，使用既定相机/文本子集；播放器使用固定场景光，不搬运工作台后处理/环境贴图。无新增依赖、服务器或项目持久化迁移。源码归档纳入实际构建的 schema 输入，公共交付 staging 补齐对应配置和 postbuild 脚本。

真实客户大模型、Windows/macOS 浏览器与移动端未验证；Linux Chromium 自动化不替代目标设备验收。离线副本可复制、不能远程撤销；模型上限 128 MiB，Base64、播放器和源码增加交付体积。回滚无需清空任何用户数据。
