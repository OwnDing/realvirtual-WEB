---
doc_id: ARCH-SEC-001
title: 脚本执行与供应链安全边界
status: approved
owner: security
last_reviewed: 2026-10-22
authority: normative
---

# 脚本执行与供应链安全边界

批准依据：[ADR-0019](../adr/ADR-0019-supply-chain-and-script-trust.md) 与 [EP-SEC-001](../exec-plans/active/EP-SEC-001-supply-chain-and-script-security.md)。本规范描述预期边界；实际验收和未关闭缺口见 [安全验收](../acceptance/SECURITY.md)。

## 信任与执行

| 入口 | 执行权限 | 必须满足的条件 |
| --- | --- | --- |
| 工作台 WebComponent | QuickJS guest + 明确暴露的 SDK 能力 | 部署 `scripting.sandbox` 未禁用、当前模型内容被显式启用、模型逻辑未被签名/组合信任策略阻断 |
| 项目编译 JS sibling | 原生页面权限，包括网络/DOM；不受 QuickJS 限制 | 部署 `scripting.native` 未禁用、项目 ID + 实际 JS 路径 + 完整 SHA-256 的同意、读取源及加载代次仍有效 |
| 构建内置插件 | 应用可信代码 | 源码审查与构建门禁，仍受原有访问/工业写权限约束 |
| 访客演示、单文件演示 | 不运行模型脚本 | 保持 ADR-0012/0013 的拒绝策略 |

`?scripts` 和构造器 `allowScripts` 只呈现脚本编辑/确认入口。`setAllowScripts(true)` 是宿主的显式当前模型确认操作，不能由项目数据或 URL 调用。切换/清空/销毁模型撤销授权；异步加载 QuickJS 时再次核对代次和脚本内容。编辑器 Save/Run 只更新当前编辑目标的内容授权；若其他脚本同时变化则关闭授权，要求重新确认。部署配置可禁止两类入口；缺失字段保留“可请求同意”，不是预先授权；不完整、类型错误或未知字段的 `scripting` 对象拒绝两类入口。未知部署 schema 也拒绝。项目、用户偏好和 URL 不拥有此字段。

原生脚本在提示前复制读取到的字节，使用 `@noble/hashes` SHA-256，不采用短哈希/FNV 作为授权身份；只从已同意的副本创建 Blob 并导入。没有字节的 URL fallback 拒绝。同意等待期间项目/加载代次失效则不导入。原生脚本一旦进入动态 import，其顶层副作用不能撤回；内容确认不将其变成沙箱，第三方测试必须单列这项能力。发布方仍须审查模块本身及其依赖的原生代码。

原生 consent 表版本从 1 升为 2：旧项目级 grant 不迁移成新 grant。新键是 `[projectId, jsRef, contentDigest]`；代码变化、路径变化、项目变化分别重新确认。同内容的并发请求共享一条提示，不同内容拒绝合并。撤销按项目清除所有内容记录；存储失效时保持会话内明确决定，未挂载提示宿主时拒绝。

## 威胁与控制

| 威胁 | 控制与证据 | 残余边界 |
| --- | --- | --- |
| 无限循环、setup/handler 属性 getter、错误 getter | 所有宿主→guest 操作与转换处于共享最早 deadline；异常后 poison/disable；外部进程 watchdog 验证 | QuickJS interrupt 是协作式边界，不能中断任意宿主原生函数 |
| guest toJSON/accessor、循环/大对象回传 | 初始化时捕获内建函数；数据复制拒绝 accessor，忽略 toJSON 执行；深度 16、4096 个值、65536 UTF-16 单位、64 参数 | 对 Proxy 的内部操作仍可能执行 guest 代码，必须留在 deadline 内 |
| 高频桥接副作用、注册/通知堆积 | 每个最外层调用最多 1024 次桥接；1024 订阅/通知队列，8192 节点/组件/计时器登记，连续内核每 Tick 最多分发 1024 个计时事件；关闭后释放注册并拒绝回调 | 不能将 guest heap 限额当作宿主总内存上限；宿主能力实现需要逐项审查 |
| 内容授权复用、异步换项目 | 内容摘要与代次校验、当前模型授权、v1 consent 失效 | 已控制宿主页面的代码不在浏览器内部 consent 的防御范围 |
| 供应链未知/缺失记录 | 全量 lockfile 对账，npm audit 结构校验，CycloneDX 1.5 schema 验证，许可正文及摘要 | 已知漏洞扫描不能证明无恶意依赖或未知漏洞 |
| 构建树被误作交付物清单 | Rollup 实际输入图 + 最终文件集/摘要，独立发布检查 | 复制资源、WASM 内嵌引擎、补丁、OCI/原生依赖必须单独取证 |

32 MiB guest heap 默认值保持；共享 RVScriptHost 的堆限额覆盖全部 context。stack 上限为 512 KiB。默认每次调用 5 ms 不变，配置限额必须为有限正数。正常脚本的固定 Tick、PLC 方向、NodeId、GLB/rv_extras 与项目文档格式不变。

全新 context 在安装用户代码/真实能力之前，用可信常量和 inert callback 预热完整数据桥路径（参数读取、预算检查、返回值转换）。这一步独立限时 1 秒；共享 host 嵌套创建 context 时仍服从外层更早的 deadline。临时句柄全部释放，不向 guest global 留下初始化入口；首次用户调用重新计数并使用原 5 ms 预算。此举减少浏览器首次编译绑定代码造成的预算误耗，不保证所有设备或负载下正常脚本都能在 5 ms 内完成。

SDK 首次用于一个 host 时，还在独立临时 context 中执行固定的内置初始化源码，覆盖真实 `self` 构造、SDK 分派和 setup 包装路径。仅使用 detached node、独立调度器和空日志回调，不引用调用者的模型、信号或其他能力；每个初始化调用限时 1 秒，完成或失败后都释放该 context。初始化失败阻止用户源码运行。后续用户 context、setup 和生命周期调用继续使用原配置（默认 5 ms），不会重试失败的用户 setup。

## 供应链判定

公共在线扫描只接受 npm v3 lockfile 中可完整对应的 registry.npmjs.org 归档和 SHA-512 integrity。别名包同时保存安装路径名和真实包名。任何私有、链接、非固定或含认证信息的来源在联网前失败；不得删去它再宣称完整扫描。扫描时不运行包安装脚本、不修改 lockfile。未安装的平台 optional 包从经过 integrity 校验的归档只读提取证据，不解包执行。

`security/policy.json` 固定扫描器版本与策略。High/Critical 全量阻断，开发依赖也包括在内。Low/Moderate 必须有精确身份、首次发现时间、到期日、责任人和修复任务。所有例外要求 advisory/包/版本/路径/integrity 精确匹配，具名批准和补偿措施；High 最长 14 天，其余最长 30 天，Critical/已知利用/许可证权利缺失不能使用安全例外。正式发布不接受 High 例外。

SPDX `AND` 必须全部满足，`OR` 记录选中分支，`WITH` 必须精确审定。缺失、非 SPDX 或策略未批准的表达式进入人工复核；许可元数据不替代正文。构建报告收集 LICENSE/NOTICE/COPYING 等正文及 SHA-256，保留未知项。对缺正文、字体/数据署名、LGPL/OCCT 本地补丁等问题逐项建立来源和义务证据，不能把“开源”视为商业分发许可已解决。

连续内核在事件交付时确认并移除计时器登记，reset 同时清理登记；取消事件的物理 heap 槽位也纳入预算，防止取消/注册循环积累墓碑。私有 DES scheduler 未提供事件 ID 确认接口时，计时器登记保留到 reset/dispose 并受 8192 上限约束；该私有运行路径须在商业构建中补充复测，不能以公共连续内核结果替代。
