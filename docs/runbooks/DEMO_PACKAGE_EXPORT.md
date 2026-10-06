---
doc_id: RUNBOOK-DEMO-EXPORT-001
title: 单 HTML 演示制作与离线交付
status: approved
owner: engineering
last_reviewed: 2026-10-06
authority: normative
---

# 单 HTML 演示制作与离线交付

## 制作与交付

1. 在 Viewer / Planner 或公共智能资产编辑器中打开 CAD/GLB，完成元数据与材质编辑，并等待所有资产引用加载完成。
2. 打开当前文档卡片的更多菜单，选择 **演示打包**。右侧面板保留画布操作，可以旋转、缩放和调整视角。
3. 使用透视相机，点击 **设为初始视角**。点击 **添加当前镜头**，填写标题和说明，设置转场/停留时间；可预览、上移、下移、删除镜头并选择循环。没有镜头也能导出自由浏览演示。
4. 使用 **保存导览配方** 保存 `.demo.json`，以后通过 **打开导览配方** 继续编辑。配方只包含镜头和演示信息，不包含模型；重开时应先打开对应模型。
5. 选择演示语言，点击 **导出演示 HTML**。打包失败会显示原因；取消、关闭面板或切换文档会阻止迟到下载。
6. 把下载的 `.html` 复制给接收者。断网后用支持 WebGL 2 的桌面浏览器直接打开，播放导览或手动旋转/缩放。拖动画布会停止导览，重新播放从首镜头开始。页面隐藏时暂停，返回后继续。

离线 HTML 含完整模型数据，接收者可以复制；文件不具备账号校验、到期、撤销和服务端审计。需要这些能力时使用 [受保护演示](PROTECTED_PRESENTATIONS.md)。首版只包含公开 embed 渲染与内建连续仿真，不包含工作台、HMI、任意脚本导览、PDF、工业连接或 DES。材质光照使用独立播放器的固定场景光，不导出工作台环境贴图和后处理设置。

接收者可从底部下载导览配方以及播放器对应源码和许可证；播放器为 AGPL-3.0-only，模型内容权利由交付方负责。

## 构建与诊断

完整 `npm run build` 自动生成 `dist/demo-player/demo-player.js`、`demo-player.json` 和 `demo-player-source.zip`。三者必须和同版本应用一起交付；保持部署子路径。导出端校验版本和两个 SHA-256 摘要，拒绝混合部署或损坏文件。

开发环境先运行 `npm run build:demo-player`，Vite 开发服务器会按应用基路径读取上述产物。改动播放器、共享导出契约或源码后重跑该命令。源码归档只包含公开源文件、实际构建依赖的 schema、构建配置和脚本、依赖锁文件与许可证；不归档 public 模型、项目数据、私有 sibling 或环境文件。

- 未解析引用：回到源文档加载缺失资产，再导出；不会用占位几何冒充成功。
- 外部资源/脚本：嵌入纹理并移除外部依赖或脚本/WebComponent；首版拒绝这些内容。
- 体积超限：模型上限 128 MiB；HTML 因 Base64 和运行时/源码而大于 GLB。拆分场景后分别交付。
- 构建错误：检查三个播放器产物是否可在当前应用同源基路径读取，重新构建完整应用。
- 浏览器无法播放：确认 WebGL 2 可用、浏览器允许本地 HTML 脚本。保留原配方和模型，在受支持环境重导；不把文件打开失败当作已交付成功。

## 验证与回退

运行 `./scripts/verify.sh static`、`node`、`browser`、`build`；构建后依次运行 `node scripts/test-demo-package.mjs` 和 `node scripts/test-demo-package-authoring.mjs`。前一项在全新断网 Chromium 上打开真正的生产播放器 HTML，验证几何像素、镜头、导览、拖动接管、复位、下载、注入负例和网络尝试；后一项从部署子路径中的生产工作台实际点击导出，并在断网浏览器打开下载文件。证据位于 `test-results/demo-package/`。关键逻辑测试在 `tests/demo-package*.test.*`。

目前自动化覆盖 Linux Chromium；Windows/macOS 浏览器、真实客户大模型以及浏览器内存上限仍需目标设备验收。回退新增入口和播放器构建即可，无需迁移或清空已有项目；已交付文件保留独立副本，修复后需重新导出交付。

## English quick guide

Open and edit a model, then choose **Demo package** in the current document card menu. Use a perspective camera, capture the initial view, add/reorder/preview shots and save the `.demo.json` recipe. Choose the demo language and **Export demo HTML**. Copy the HTML to another machine and open it directly while offline. Dragging the canvas stops the tour; replay starts from the first shot. The file contains model data and cannot be remotely revoked. Full HMI, arbitrary script tours and industrial connections are outside this player. Build with `npm run build`; for development build the player first with `npm run build:demo-player`.
