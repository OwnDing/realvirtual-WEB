---
doc_id: ACCEPT-COMPAT-001
title: L3-2 兼容性验收矩阵
status: approved
owner: qa
last_reviewed: 2026-10-19
authority: normative
---

# L3-2 兼容性验收矩阵

| 行为 | 验证入口 | 证据边界 |
| --- | --- | --- |
| 版本上下界、未知环境、非法矩阵、声明与证据匹配 | compatibility Node 测试、生成检查 | 规则正确性，不是浏览器认证 |
| HTTPS、WebGL2、OPFS、权限、取消/超时与清理 | compatibility Browser 测试 | 隔离浏览器与故障注入 |
| 独立检查页、双语、窄屏、下载、无外呼、真实模型加载和回退 | `node scripts/verify-compatibility-production.mjs` | 生产字节；实际记录浏览器和软件/硬件后端 |
| Chrome / Edge 实际浏览器、受支持范围端点 | 同一生产脚本的 channel/executable 参数 | 必须实际运行，不能改 UA 冒充 |
| 实际 GPU 与性能 | 生产脚本 hardware 模式、L2-3 hardware benchmark | SwiftShader 不算实机；30 次与场景统计仍必需 |
| 文件夹保存重开、企业 TLS/策略、XR 会话/控制器 | 客户 IT 验收清单 | 手工证据，不因 Mock/API 探测通过而认证 |

本计划交付时补充实际运行结果。未运行条目保持未验证，正式认证不得由 CI 缺失设备的 skip 推导。完整 Appliance 的缺口仍由 [EP-APPLIANCE-001](../exec-plans/active/EP-APPLIANCE-001-offline-appliance.md) 跟踪。
