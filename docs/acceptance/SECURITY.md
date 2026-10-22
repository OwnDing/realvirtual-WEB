---
doc_id: ACCEPT-SEC-001
title: L3-3 安全验收矩阵
status: approved
owner: qa
last_reviewed: 2026-10-20
authority: normative
---

# L3-3 安全验收矩阵

规范：[脚本安全边界](../architecture/SCRIPT_SECURITY.md)。状态必须以候选提交的实际报告更新；不得用本表代替第三方报告。

| 编号 | 正例 / 反例 | 可执行入口 | 验收证据 |
| --- | --- | --- | --- |
| SEC-01 | 完整公开依赖树；私有源、缺 integrity、别名/平台包遗漏被拒 | `./scripts/verify.sh supply-chain` | inventory、CycloneDX、completeness 对账 |
| SEC-02 | 已知 High 阻断；精确限期例外；过期/通配/Critical 例外拒绝；较低风险无分诊拒绝 | `tests/security-policy.node.test.ts` | fixture 只证明判定器；真实 npm-audit.json 另外证明查询 |
| SEC-03 | SPDX OR/AND/WITH；缺许可、缺正文、无效表达式阻断 | 同上 + licenses.json | 每条失败不得被空清单掩盖 |
| SEC-04 | 网络/工具/JSON/schema 失败非零；lockfile 扫描期间变化拒绝 | `scripts/security/run-supply-chain.mjs` | summary exit 2 表示扫描失败，exit 1 表示策略失败 |
| SEC-05 | 正常 guest 计算/桥接/生命周期；循环、内存、getter、toJSON、宽对象、循环对象、嵌套调用 | `node scripts/security/test-script-boundaries.mjs` | 真实 QuickJS + Chromium；120 秒外部进程树 watchdog，不依赖页面定时器 |
| SEC-06 | URL 只请求；部署禁用；模型切换/撤销/编辑/销毁与 WASM 初始化竞争 | `tests/web-component-security.test.ts`、`node scripts/security/test-script-production.mjs` | 单元竞争反例 + 实际构建与 UI 确认；无 stale registry、无未授权实例 |
| SEC-07 | 代码 digest 变化、项目变化、旧 consent、无提示宿主、字节缓冲被修改、URL-only fallback | consent/runtime-loader 浏览器套件 | 导入器次数、实际 Blob 字节、同意存储 v2 |
| SEC-08 | 构建最终文件完整；新增/删除/篡改文件拒绝；过期报告或不同 commit/lock 拒绝 | release-evidence + security-policy Node 套件 | 实际 artifactSetSha256，未映射文件不得隐式排除 |
| SEC-09 | SDK 注册/队列/定时器风暴，关闭后无后续信号写入 | SDK 与 reload/teardown 回归、第三方专项 | 不把一次 guest deadline 当作所有宿主工作均有硬超时 |
| SEC-10 | 实际 WEB/播放器/Appliance 的复制资源、WASM、补丁、OS/原生库及许可义务 | `scan-artifact.mjs`、`artifact-scan.node.test.ts`、候选发布证据核验 | 本地镜像/原生扫描绑定工具/DB/输入摘要；未知版本和未具备的目标保持未验收 |
| SEC-11 | 独立机构测试、修复、同一候选版本复测 | [委托任务书](../delivery/SECURITY_OPERATIONS.md) | 机构签署报告、范围/摘要、风险签收 |

## 当前交付边界

本 PR 提供门禁、回归与证据生成/校验入口。只有真实扫描通过才算 M1 的绿色黄金切片完成；现有 High 和缺许可正文/义务复核项不自动设为基线豁免。M3 必须逐目标补齐实际发布取证；M4 需要 Owner 提供外部机构、授权目标与报告。本仓库没有第三方渗透测试报告，不得宣称 L3-3 企业交付已关闭。

新增 required check 的远程分支保护配置需要独立授权并读回验证；PR 内 job 存在不等于远程已经强制。
