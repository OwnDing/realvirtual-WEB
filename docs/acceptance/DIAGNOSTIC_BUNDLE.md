---
doc_id: ACCEPT-DIAG-001
title: 诊断包验收矩阵
status: approved
owner: qa
last_reviewed: 2026-10-14
authority: normative
---

# 诊断包验收矩阵

| 行为 | 验证 |
| --- | --- |
| ZIP 正常下载、JSON 解析、版本/文件清单一致 | `tests/diagnostic-bundle.node.test.ts` 与 `scripts/diagnostic-production-journey.mjs` |
| 注入秘密/URL/客户命名/循环对象/getter | bundle/collection 测试，生产旅程逐文件检查导出内容 |
| 捕获 error/rejection/console、原控制台行为、重复挂载/卸载及第三方包装共存 | `tests/diagnostic-session.test.ts`、既有 rv-debug 与 DEV serializer 回归 |
| 空场景、无 GPU、超时、取消、场景切换、超限、WebGPU device 能力 | `tests/diagnostic-collection.test.ts` 与 UI 行为测试 |
| ZIP 加载/打包失败 → JSON，无秘密异常泄漏 | bundle 与 `tests/diagnostic-ui.test.tsx` 的真实 JSZip 故障注入 |
| 无额外服务请求/上传/Socket/存储/工业写 | 生产请求/Socket 监听、禁止 I/O 的采集打包测试、隔离网络门禁；工业部分仅静态只读接线，无实机写测试 |
| 中英文、范围开关、预览同一快照、错误入口、设置锁/Kiosk/访客 | UI 与生产旅程；生产窄屏 390px、键盘 Enter 下载 |
| 上下文丢失仍能下载 | 生产 WebGL `WEBGL_lose_context` 真正失效后下载、解析状态与事件码 |
| 取消/关闭后无迟到下载，释放对象 URL；无项目/模型迁移 | UI/session 生命周期、既有回归门禁 |
| 大场景有界开销 | collection 测试使用 100001 个合成子节点、100000 节点上限、让出主线程与取消；不是客户大模型性能承诺 |

用户操作与包内状态解释见[运行手册](../runbooks/DIAGNOSTIC_BUNDLE.md)。生产证据输出到 `test-results/diagnostics/production.json`、`panel.png`、`panel-narrow.png`；隔离网络汇总见 `test-results/offline/report.json`。

2026-10-14 已通过公共静态检查、Node 全量 852 项、浏览器八批及独立性能测试合计 11023 项、公共生产构建和隔离网络旅程。诊断实际导出六个文件，期间仅加载一个同源静态资源，无 Socket 或外部请求。浏览器证据来自 Linux ARM64 Chromium 145 / SwiftShader；真实 WebGPU、其他浏览器、移动设备、真实工业连接和远程 CI 未验证。

2026-10-15 PR #16 补充可见性回归：真实 `embedded` 上下文下设置槽位、面板和原生入口均隐藏；部署配置加载后及显示启动错误前刷新原生入口。55 项诊断/上下文/模式测试及 15 项构建分块测试通过，生产构建验证普通、锁定、真实 iframe 三种启动失败场景。证据见 `test-results/diagnostics/access.json`，同一场景纳入隔离网络门禁。

实施记录与失败修复复验见 [ExecPlan](../exec-plans/completed/EP-DIAG-001-local-diagnostics.md)。未运行验证不得标为通过。
