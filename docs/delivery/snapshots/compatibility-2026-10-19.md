---
doc_id: SNAPSHOT-COMPAT-001
title: L3-2 兼容性工程交付证据
status: snapshot
owner: engineering
last_reviewed: 2026-10-19
authority: snapshot
---

# L3-2 兼容性工程交付证据

PR：[OwnDing/realvirtual-WEB#17](https://github.com/OwnDing/realvirtual-WEB/pull/17)，目标 `develop`，基线 `80e4273d359824fbd682540da5ebec55b622c1d6`。首个功能提交 `06aafcbd1dbd78fd9bfddc78af4af5b9ac392fe5`。本快照记录功能测试事实；产品约束见 [PS-COMPAT-001](../../product-specs/COMPATIBILITY.md)、[ADR-0018](../../adr/ADR-0018-compatibility-evidence.md) 和[验收定义](../../acceptance/COMPATIBILITY.md)。

## 已有证据

- 本地：Linux ARM64，Node 22.22.2，Playwright Chromium 145，SwiftShader。治理、静态检查、构建通过；Node 84 文件 / 864 测试通过。聚焦浏览器回归 3 文件 / 22 测试通过，覆盖主动检查、既有 Appliance 诊断和支持入口。
- 最终检查页及 Viewer 生产流程：`node scripts/verify-compatibility-production.mjs` 5/5 通过，包含主动检查/下载/返回页面、取消挂起的存储检查、缺失矩阵/图形、真实模型与诊断入口、WebGPU 缺失回退；同时验证无外部请求、390px 窄屏和默认品牌文字对比度。保存[原始 JSON](compatibility-production-2026-10-19.json)，构建字节 SHA-256 为 `16b9f0d56eba50f897d400ecf80704500acd803671e491df4a70720306de9f27`。该摘要覆盖生产资源，避免将父提交号误当成含本地修改的生产构建身份。
- 既有被动诊断回归：`node scripts/verify-diagnostics-production.mjs` 通过真实生产 ZIP 下载、预览一致性、脱敏、排除项、实际 GL context loss，以及未锁定/锁定/嵌入场景启动失败入口；未改变 L3-1 包契约。
- 最终兼容复核补充保留 Appliance v1 报告的 `browser.data.family` 字段；其浏览器测试 3/3 通过，新增字段兼容断言。该变更仅影响 Appliance 诊断脚本，不修改上述 Web 生产构建字节。
- 本地全量浏览器首轮在第 5/8 分片停下：既有 `rv-multiuser-perf.test.ts` 的 16ms 断言实测 17.7ms，当时并行运行生产构建。构建结束后原样单独复测该文件，11/11 通过；没有改阈值、删测试或静音首次失败。第 6–8 分片和独立性能套件随后按原命令和 GC 环境补齐，全部通过。全部分片合计 1,048 文件 / 11,036 测试通过，保留 5 个既有跳过文件、12 个跳过用例和 2 个 TODO；此数字包含失败文件的成功复测，不代表首次完整命令一次通过。
- Windows 实际浏览器：`06aafcb` 的 [Windows browser compatibility](https://github.com/OwnDing/realvirtual-WEB/actions/runs/39193131366/job/117870045544) 通过，Chrome、Edge 各完成检查/下载、缺失矩阵/图形失败、Viewer 与支持入口、WebGPU 缺失回退。使用托管 Windows 和软件 GPU；[原始报告与截图](https://github.com/OwnDing/realvirtual-WEB/actions/runs/39193131366/artifacts/12160539186) 记录实际版本和环境。后续提交的验证以 PR 对应 SHA 的检查结果为准。
- 首个功能提交 `06aafcb` 的 [Quality Gates](https://github.com/OwnDing/realvirtual-WEB/actions/runs/39193131366) 六项均通过：治理、静态、Node、构建、Windows Chrome/Edge 和完整 Browser Gate（含离线、HTTPS 展示、单文件演示、白标及加载性能旅程）。最终提交的检查以 PR 当前 SHA 为准。

软件 GPU 测试、loopback HTTP、OPFS 临时文件读写和 API 前提检测均不能作为完整产品或最低配置认证。发布矩阵继续保留 `unverified` 与空认证证据；这里的部分功能证据不自动晋升为认证证书。

## 待实机验收

Windows 11 x64 的承诺浏览器范围端点、真实集显/独显及驱动、30 次场景性能基准、企业 HTTPS/WSS 与策略、浏览器项目与真实文件夹保存重开、XR 设备会话/输入/退出重进。具体 CPU、RAM、GPU 最低数值尚未批准；Firefox、Safari、移动设备也没有新增支持承诺。[ExecPlan](../../exec-plans/active/EP-COMPAT-001-compatibility-matrix.md) 保持 active。

## 回退

撤销本 PR 的支持入口和独立检查模块，并从矩阵源重新生成交付投影；不涉及项目数据、GLB、NodeId、许可证或持久化迁移。保留证据以便追溯。
