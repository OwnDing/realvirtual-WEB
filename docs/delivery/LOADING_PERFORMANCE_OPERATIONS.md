---
doc_id: DELIVERY-PERF-OPERATIONS
title: L2-3 性能包制作、验证与回退
status: approved
owner: engineering
last_reviewed: 2026-10-09
authority: normative-process
---

# L2-3 性能包制作、验证与回退

依据 [产品规格](../product-specs/LOADING_PERFORMANCE.md)、[ADR-0014](../adr/ADR-0014-progressive-loading.md) 和 [包契约](../contracts/PERFORMANCE_PACKAGE.md)。

## 制作与使用

在已安装锁定依赖的仓库内运行：

```sh
npm run prepare:performance -- /absolute/path/model.glb
```

工具保留源文件，生成 `model.glb.perf.json`、`model.glb.perf.json.report.json` 与同目录 `rv-performance/<source-sha256>/`。可用第二个路径参数指定清单输出位置；资源总是在清单旁边。部署时将清单和资源一起放到源 GLB 旁，保持相对路径。工具只处理显式本地输入，不上传模型，也不调用云端服务。

支持自包含 GLB 的三角形几何和嵌入基础颜色纹理。输出两个简化级别、128/512 像素 PNG 和稳定的源节点/primitive 索引。不能安全生成完整总览的蒙皮、形变、压缩 primitive、外部缓冲、引用场景或非法输入会报错，不发布缺少几何的清单。动态加工等对象保留原精度并出现在报告中；预算超限必须使用普通加载。已有旧清单不会赋予新源文件信任，源摘要不匹配时撤销预览并回退。

公开应用的加载入口自动发现无查询参数的 HTTP(S) `.glb` 旁文件。项目内存数据、blob、带签名查询参数的链接与单文件演示继续使用原加载路径。缺少性能包正常加载；坏包提示回退；可选资源尚未准备好而完整源已下载时，立即放弃预览准备，完整加载不会等待它。

总览只允许旋转和缩放。原模型依次经过既有签名校验、解码、组合、组件构建、批处理与首帧渲染后才算就绪；组件只初始化一次。用户操作过总览后，视角会传给完整场景。失败保留已可用总览并提供重试；取消会中止下载、丢弃迟到解码结果、释放预览资源。

## 画质

“设置 → 视觉 → 性能与画质”提供自动、高、均衡、流畅和自定义。已有视觉偏好默认保留，新安装默认自动。自动只调整会话 DPR、阴影、AO、Bloom 与 LOD 档位；不写回保存的视觉参数，不改变逻辑或仿真时间步。手动调整视觉参数会退出自动模式。后台、加载、静止按需渲染和 XR 不参与自动采样。

## 自动验证与基准

```sh
./scripts/verify.sh static
./scripts/verify.sh node
./scripts/verify.sh browser
./scripts/verify.sh build
npm run verify:performance
npm run benchmark:performance
```

生产验证以本机 dist 启动 loopback 服务，生成公开合成模型，执行 9 项流程：总览先出现、取消重试、损坏包回退、慢包不阻塞完整源、源摘要不匹配回退、源加载错误保留总览、画质与重复加载释放、设置界面手动覆盖、取消未完成的延迟工作后重新加载。硬门禁要求夹具总览 ≤ 3 MiB、传输体积减少至少 80%、真实可见预览先于完整就绪。该检查在 required Browser Gate 内执行，失败保留截图和 Playwright trace；不修改既有性能烟测阈值。

`benchmark:performance` 使用约 50 MB / 175 万三角形夹具，分别测量 30 次冷启动、30 次关闭性能包的基线和 30 次同页面重复加载，并记录 10 秒固定环绕路线。冷启动固定 1080p、100 Mbps、20 ms；基线为同一构建关闭可选包。重复加载测量已启动的应用/模块/渲染器，服务为 `no-store`，不代表 HTTP 热缓存。

输出位于 `test-results/loading-performance/`：环境、夹具统计、阶段耗时、导航到总览、导航到完整就绪、重复加载资源计数及路线帧率。只使用合成模型，不记录客户资产或生产数据。软件 GPU 仅证明功能与该环境的基准；`salesClaimVerified` 保持 false。正式销售延迟/FPS 承诺必须另在产品规格要求的真实参考机上执行并留证。

报告中的 `feedbackMs` 使用浏览器 FCP；`overviewMs` 从页面导航计到预览首次渲染提交；`readyFromNavigationMs` 从导航计到原模型首次渲染提交；`completeMs` 只计模型加载会话。`navigationMs` 还包含 Playwright 等待观察就绪的时间，不与基线的浏览器时钟直接相减。基线 `baselineCompleteMs` 与 `readyFromNavigationMs` 使用相同边界。首次渲染提交不等于显示器实际扫描完成。P95 使用排序后第 ceil(样本数 × 0.95) 项。

同页面重复加载可能在派生资源准备前完成源下载，此时按完整加载优先原则跳过包和 LOD。环绕指标同时记录实际 LOD 数量、画质档位和三角形数，不能把没有启用 LOD 的路线当成 LOD 提速证据。资源释放计数来自另一个明确等待总览准备的流程：每轮先分别渲染原始几何与 LOD 代理，再比较相同 GPU 驻留范围，避免按需上传的首次帧时序影响计数。

参考机可运行 `npm run benchmark:performance -- --hardware` 以取消强制软件 GPU；检查报告的 `actualRenderer` 确认实际驱动，另记录设备型号、浏览器与网络条件。该选项不会自动批准销售承诺，仍需对照规格审核证据。

## 回退

从部署目录撤下对应 `model.glb.perf.json` 即可停止发现该包；确认无其他清单引用后再清理对应摘要目录。在设置中选择“自定义”恢复原视觉参数。无需迁移或改写 GLB、项目、NodeId、信号、签名和单文件演示。代码级回退为撤销本 PR 的提交，不重置或覆盖用户业务文件。
