---
doc_id: EP-SEC-001
title: L3-3 供应链门禁与脚本安全验证方案
status: approved
plan_status: active
owner: security
last_reviewed: 2026-10-22
authority: normative-process
---

# EP-SEC-001：L3-3 供应链门禁与脚本安全验证方案

## Purpose

让维护者能回答三个交付问题：**这一版带了什么、依赖的已知漏洞和许可义务是否已处理、用户内容能否越过执行与访问边界**。同时形成可交给独立安全测试方的范围、环境和验收标准。

2026-10-20 用户明确“同意，开 pr 实施”，批准 D1–D5 与范围内实施、提交、推送及创建 PR。本计划激活；第三方采购/测试目标授权、远程分支保护变更和正式发布仍分别记录，不以实施授权代替这些外部动作的授权。

建议分两个验收层次：M1–M3 形成可持续执行的工程门禁与内部安全证据；M4 取得指定发布版本的独立渗透测试及复测报告。前一层完成不能写成“已通过第三方渗透测试”，后一层未完成时 L3-3 的企业交付证据仍有缺口。

## Scope

- 全量 npm 依赖的漏洞扫描、许可证识别与策略判定，包括直接/传递、生产/开发、peer/optional 及不同交付平台的依赖。
- 与实际交付字节对应的 SBOM、第三方声明和来源证据；覆盖 WEB、演示播放器、Appliance 的镜像/原生运行时、复制的 WASM/字体/资源及本地补丁。
- QuickJS、SDK 宿主桥接、模型来源信任、原生项目代码同意与生命周期的威胁建模、行为级验证及经批准的加固。
- 新增一个 required `Supply Chain Gate`，其中漏洞、许可证、清单完整性分别出结果；安全回归继续进入现有 Node/Browser Gate。
- 发布安全证据包、漏洞处理流程，以及独立渗透测试的任务书和复测关闭条件。

## Non-goals

- 不将依赖扫描结果当成上游商业授权、整体许可证兼容性或 L0-1 的法律结论；不更改仓库 LICENSE 或 ADR-0007 的合同凭证边界。
- 不默认重写 QuickJS、迁移到 Worker/独立进程、引入新的安全 SaaS、租户系统或安全运营平台。
- 不连接真实 PLC、不测试客户生产网络、不上传客户模型/代码/凭据，不自动采购第三方服务。
- 不用“无 CVE”证明没有恶意依赖、零日漏洞或业务逻辑漏洞；不承诺仅靠浏览器内部检查抵御已控制宿主页面的攻击者。
- 不顺带关闭 EP-GOV-004、EP-APPLIANCE-001 等其他计划的剩余验收事项。

## Required Documents and Decisions

已核对的规范与关联任务：

- [开发宪法](../../governance/DEVELOPMENT_CONSTITUTION.md)、[AI 安全](../../governance/AI_SAFETY.md)、[文档优先级](../../governance/DOCUMENT_PRIORITY.md)、[变更管理](../../governance/CHANGE_MANAGEMENT.md)、[完成定义](../../governance/DEFINITION_OF_DONE.md)、[Harness](../../governance/HARNESS.md)。
- [OPEN_DECISIONS](../../governance/OPEN_DECISIONS.md)：OD-005 已关闭，新增第六项 required check 是对既有决策的扩展；OD-001 的组织/云端剩余边界不在本计划内；OD-006 不因本计划而关闭。
- Accepted [ADR-0006](../../adr/ADR-0006-deployment-identity-egress.md)、[ADR-0008](../../adr/ADR-0008-unified-configuration.md)、[ADR-0011](../../adr/ADR-0011-offline-runtime-gate.md)：部署策略权威、下层不得放宽、离线运行默认拒绝外呼。
- Accepted [ADR-0007](../../adr/ADR-0007-offline-license-evidence.md)：产品授权凭证与开源软件许可证合规是两件事。
- Accepted [ADR-0009](../../adr/ADR-0009-offline-appliance.md)、[Appliance Bundle 契约](../../contracts/OFFLINE_APPLIANCE_BUNDLE.md)、Active [EP-APPLIANCE-001](../active/EP-APPLIANCE-001-offline-appliance.md)：复用依赖锁、摘要、SBOM 和交付目录，不另建发布格式。
- Accepted [ADR-0012](../../adr/ADR-0012-protected-presentations.md)、[ADR-0013](../../adr/ADR-0013-single-file-demo-package.md)：访客演示和单文件演示均拒绝模型脚本，不能将工作台脚本攻击面直接套到这两个入口。
- Active [EP-GOV-004](../active/EP-GOV-004-gate-that-gates.md)：保持原五项门禁、失败关闭、公共构建和完整测试，修改共同入口前确认单写者。
- [旧文档登记](../../LEGACY_DOCUMENT_REGISTER.md) 中的 `doc-scripting.md`、`doc-lifecycle.md`、信号与 AI 接口文档仅作线索；关键结论已与下列代码交叉核对，实施前继续读对应路径的完整契约。

用户提供的仓库外 `COMMERCIALIZATION_ROADMAP.md` 为 2026-08-24 的 draft。这里只采用用户指定的 L3-3 工作范围，不把其中历史数字、L0-1 法律推断或“下一步行动”当作已批准指令。

### 已认可的方案选择（2026-10-20）

| 项目 | 建议 | 批准后的处理 |
| --- | --- | --- |
| D1 门禁形态 | 一个新增 required `Supply Chain Gate`，内部并列漏洞/许可证/完整性结论；原五项不变 | 在治理登记中记录决定，远程分支保护修改仍按独立外部写授权执行并读回 |
| D2 风险政策 | High/Critical 全量阻断，未知许可/未履行义务阻断；仅允许精确、具名、限期例外 | 形成 Approved 策略和机器配置，不自动接纳现有债务为白名单 |
| D3 脚本信任 | URL 只能请求启用；部署许可及当前内容的显式同意决定执行。原生项目代码同意绑定项目与执行代码摘要 | 先落到 ADR/契约、迁移与兼容说明，再修改运行时；这是相对当前行为的变化 |
| D4 发布范围 | npm 门禁先落地，但正式交付必须包含实际镜像、原生运行时、WASM 和资源的证据 | 当前缺少某目标发布物则该目标保持未验证，不借 npm 绿色放行 |
| D5 独立测试 | 企业安全交付要求第三方报告与复测；本工程先准备环境、任务书和内部测试 | 测试机构、预算、目标、时间和接收报告人员由 Owner 确定，不在此轮代为采购或外发 |

用户已明确认可上述选择；实施依据为本计划与 Accepted ADR-0019，批准来源见 Decision Log。若需要 Worker 隔离、信号写语义变化等超出 D3 的决定，另行提交 ADR，不由实现结果倒推批准。

## Current Repository Facts

2026-10-20 只读取证，分支 `develop`，HEAD `0700922`，开始时工作树干净，`package.json` 版本 `6.3.27`。数字只代表这一提交。

| 事实 | 证据与含义 |
| --- | --- |
| 尚无专门供应链门禁 | `scripts/verify.sh` 不含漏洞/许可证 scope；`.github/workflows/quality-gates.yml` 的五项 Gate 外已有 Windows 兼容性 job，并由 Browser Gate 汇总其状态。此次未查询远程保护配置，五项 required 是治理记录，不能当作今日 API 读回结果 |
| lockfile 不是充分的许可证据 | `package-lock.json` v3 有 753 条 `node_modules/` 记录，681 条缺 `license`；其中 216 条未标记 `dev`。这是路径记录计数，不是去重后的包数，也不是实际 bundle 数；缺字段不等于没有许可证 |
| 已有初步 SBOM | `scripts/build-offline-appliance.mjs:158` 从 lockfile 的 `!dev` 记录生成 CycloneDX 1.5，缺许可写为 `NOASSERTION`；缺少依赖关系和交付字节映射。`basename(path)` 回退还可能丢失 scoped 包的 scope，需要用正式包身份重建 |
| 已有部分第三方声明 | `scripts/build-demo-player.mjs` 按构建模块收集包根 LICENSE/NOTICE；Appliance 依赖要求声明 licenseFiles。两者都值得复用，但不能证明嵌入组件、所有传递依赖或分发义务已完整覆盖 |
| 有锁文件之外的供应链 | `appliance/dependencies/locks/` 有镜像 digest/原生下载摘要；`scripts/patch-occt-memory.mjs` 修改 OCCT WASM 与 glue。npm integrity 不代表打补丁后的最终文件身份 |
| QuickJS 已有基础防护 | `rv-script-sandbox.ts`、`rv-script-host.ts` 默认 32 MiB guest heap、每次调用 5 ms interrupt deadline、白名单宿主函数、poison/disable 和 dispose；多组件共用 runtime heap。锁定的 core 与 browser variant 均为 `0.32.0`，本轮未审定其内嵌引擎修订与漏洞状态 |
| 已有真实 VM 测试 | `tests/plc-sandbox-limits.test.ts`、`tests/script-host.test.ts` 覆盖循环、分配、隔离、桥接、poison 与释放。这里只读了代码，未在本轮重跑；不能描述成“本轮已通过” |
| analytics consent 不是脚本授权 | `src/core/consent-store.ts` 是统计分析 opt-in；模型外连由 `src/core/rv-load-trust.ts` 等控制；原生项目代码由 `src/core/project/rv-project-code-consent.ts` 单独授权 |
| 工作台存在两种不同的可执行内容 | `src/main.ts:746` 用 `params.has('scripts')` 开启 WebComponent；`:776` 的原生项目代码按项目 ID 请求同意。后者是宿主页面权限的原生 JS，不经过 QuickJS；当前授权记录未绑定代码摘要 |
| 资源预算有待验证的边缘路径 | `RVScriptContext` 的 setup/handler 属性解析以及结果 dump 部分位于 `_beginGuestCall`/`_endGuestCall` 之外；桥接的宿主计算、宿主分配不等于 guest heap。这里只确立审查重点，尚未构造利用或证明逃逸 |

## Proposed Design

### 1. 清单先完整，再判断风险

建立三种互相关联的清单，避免把开发树、浏览器 bundle 和离线安装包混为一谈：

| 清单 | 输入 | 用途 |
| --- | --- | --- |
| 开发/构建全量清单 | lockfile、安装树、所有 workspace/optional 平台记录、安装脚本与工具版本 | PR 漏洞与许可证检查；开发依赖也可能影响 CI 和产物 |
| WEB 交付清单 | Vite/Rollup 图、复制资源列表、播放器构建图、最终文件摘要 | 判断实际分发范围；`!dev` 只能作线索，不能作最终排除依据 |
| Appliance 交付清单 | 精确镜像 digest/归档、原生运行时包、供应商 SBOM、依赖锁与 notices | 按 OS/架构/容器或原生目标独立出报告，包含镜像内部 OS 与语言依赖 |

每项至少含完整包名/版本、purl 或其他稳定身份、依赖路径、来源摘要、运行/构建/分发范围、声明许可证、复核结论、LICENSE/NOTICE 正文及摘要、例外引用。许可证缺失、包身份不明、扫描器不支持和输入不存在分别表示，不能合并成空结果。

完整 lockfile 是平台依赖的总表。当前主机未安装的 optional 包仍参与已知漏洞匹配；许可证证据可从按 lockfile integrity 校验的公开包归档提取，或由已验证的对应平台证据补齐，无需在错误平台强行安装。缺证据时保持 incomplete，不让“本机不存在”自动成为合规豁免。

对 QuickJS/WASM、OCCT、字体、拷贝的第三方源码/静态资源建立补充登记：npm wrapper 与内嵌引擎/库分别记来源、版本/修订、许可、补丁与最终文件 SHA-256。客户提供的模型只登记权利来源流程，不把客户资产打包进公共扫描报告。私有 sibling 缺席时报告公共构建范围，商业交付含私有组件则必须补齐对应证据。

### 2. 工具选型与数据边界

首版建议采用以下组合，实施时锁定经验证的工具版本和校验和，不能以临时下载 latest 作为门禁。

- **npm 已知漏洞：**用固定 Node/npm 的 `npm audit --json` 生成原始证据，覆盖开发与运行依赖；包装器校验报告结构、实际覆盖和退出原因，再按本项目政策判定。禁止 `audit fix` 或扫描期间改 lockfile。npm 会向 registry 提交依赖信息，且可能回退到提交完整树的接口，因此只允许对预先验证为公开的输入执行在线审计；私有/客户构建用内部服务或经批准的离线数据库方案，不静默删包后冒充全量扫描。[npm 官方行为说明](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
- **SBOM/许可取证：**采用锁定的 `@cyclonedx/cyclonedx-npm`，显式输出兼容现有交付的 CycloneDX 1.5，保留 scoped 身份、关系与包内许可正文；其正文采集目前标为实验能力，必须用 fixture 验证并补齐遗漏。lock-only 只能产出初步清单，不能充当正文审计。独立执行 schema 与完整性检查，不能依赖工具“条件不满足时跳过 validation”的默认行为。[CycloneDX 官方工具](https://github.com/CycloneDX/cyclonedx-node-npm)
- **许可政策：**在标准 SPDX expression parser 上实现薄策略层，采用明确的 `allow / review / deny` 和已复核包证据；不自制基于名称子串的识别器。将声明与人工复核分开保留，未知正文交由安全/法务复核，不能猜成 MIT。`AND` 全部满足、`OR` 记录选中的许可分支、`WITH` 保留例外及适用条件。[SPDX 表达式规范](https://spdx.github.io/spdx-spec/v2.3.1/SPDX-license-expressions/)
- **非 npm 发布物：**使用锁定的 Trivy 对实际 OCI 归档/镜像和其支持的文件系统内容取证；未识别的原生或嵌入组件必须补供应商清单及上游安全公告匹配，不能宣称一个工具覆盖全部二进制。测试的是最终交付 digest，不只扫 Dockerfile 或基镜像标签。[Trivy 镜像扫描说明](https://trivy.dev/docs/latest/target/container_image/)

所有工具都是开发/发布工具，不进入客户端启动流程；客户内网运行不联网扫描。npm API/漏洞数据库不可用时返回“扫描未完成”，不绿色放行。离线复放报告可用于复现，但不能替代 required CI 的当前扫描。需要私有输入离线检查时，可验证 [OSV-Scanner 离线模式](https://google.github.io/osv-scanner/usage/offline-mode/)，不能在本轮把它写成已经接入。

### 3. 阻断、修复与限期例外

| 情况 | 建议默认行为 |
| --- | --- |
| High/Critical，包含 dev/build 工具 | 阻断 PR 与发布；无修复版本也不自动放行 |
| 已确认可利用、已知遭利用或恶意组件 | 不受评分低或缺分值影响，阻断；先隔离/移除/修复，不能自动例外 |
| Moderate/Low | 完整报告并具名分派，建议分别 30/90 天内处理；过期无处置或批准例外则失败 |
| 缺严重度或身份无法映射的漏洞结果 | 待分诊并阻断，不当作 Low 或“没有漏洞” |
| 未知/无法解析许可、正文与声明矛盾、缺必要通知、已知义务未履行 | 阻断；人工补证或替换后才能通过 |
| GPL/AGPL/LGPL/MPL、双许可、专有或自定义许可 | 结合分发方式、链接/修改情况逐项复核；不做“所有 copyleft 禁止”或“根项目 AGPL 所以全兼容”的规则 |
| 网络失败、超时、工具崩溃、schema 不兼容、空/截断报告、关键输入缺失 | 环境/工具错误退出 2；政策违规退出 1；唯有完整且符合政策才退出 0 |

扫描输出包括全量和相对基线的差异；首轮既有问题同样适用，不能用“基线全部忽略”偷换门禁。一次有依赖漏洞时仍须产出许可证结论，反之亦然。

例外由版本化登记拥有，至少含具体 advisory/许可问题、精确包版本/依赖路径或 artifact digest、影响范围、证据、补偿措施、负责人、批准来源、到期日和修复任务。建议 High 最长 14 天，其他最长 30 天；Critical 及已利用问题不在普通例外范围。不可到期自动续期，不允许全包名/整个目录通配豁免；版本变化、摘要变化、证据不符或过期均重新失败。许可证权利不明不能靠安全负责人单方面豁免为“可以分发”。

合入与企业交付分开判定：上述 High 限期例外可用于推进内部整改，不自动授予企业发布资格；M4 的正式交付建议要求无未关闭 High/Critical。许可清单进入可分发状态还须有对应义务的履行证据及责任人确认。

可达性分析用于给精确例外提供证据，不默认把 `dev`、未打进 JS 或暂未调用当成安全。新增依赖本身和扫描工具的传递依赖也纳入策略；修复采用逐项升级/替换及回归，不能一键强升所有包。

### 4. CI、发布与持续复查

- 新增 `./scripts/verify.sh supply-chain` 并纳入 `all`；它有明确的联网、工具及证据输入前提，Harness 仍不安装工具、不改锁。本地仅跑离线自检时不得称 `all` 已通过。
- `Supply Chain Gate` 在每个 PR 与受保护分支 push 上执行，不用路径过滤使 required check 缺席。报告含扫描范围、包覆盖数、工具/策略版本、commit/lockfile 摘要、获取时间和来源。每日定时复扫默认分支及仍受支持的已发布 SBOM，发现新问题进入漏洞处理流程；定时失败不会倒改旧 commit 状态，但阻止下一次交付并记录受影响版本。
- npm 报告未提供数据库版本时如实写“未提供”，记录获取时间和响应摘要，不伪造数据库日期。发布前建议 24 小时内重新查询；离线数据库额外记录数据库生成/更新时间和 digest，超过批准的新鲜度窗口不得放行。
- 新增 job 保持只读 token，不用带 secrets 的 `pull_request_target` 执行 PR 代码；第三方 Action 固定提交 SHA，扫描工具校验下载来源/摘要。清点 install/postinstall 脚本，在隔离、无发布凭据环境执行；若调整 `ignore-scripts`，必须列出本项目 OCCT 补丁等必要显式步骤并验证产物，不能直接关闭脚本导致假绿。
- 本地与远程同入口、同策略。远程 required check 先在候选提交验证运行成功，再在明确授权后扩展 `main`/`develop` 分支保护；读回实际配置并保留证据。只改 YAML 时状态是 configured，不能写 enforced。
- PR 先验证公共全量依赖与发布配方；交付门禁再扫描**实际构建的**所有目标产物。没构建某个 OS/架构不代表其通过。发布物修改、依赖更新或本地补丁变化使旧报告失效，必须重新关联摘要。

输出建议为 `test-results/security/` 中的 JSON、可读摘要、CycloneDX、许可证清单/正文、例外与覆盖报告。发布时放入既有 SBOM/licenses 目录及安全证据目录，并关联最终 artifact manifest；不把 SBOM 自身纳入自身摘要造成循环。CI 报告只留脱敏依赖/测试证据，发布证据随该版本支持周期归档。安全报告进入交付物后仍需校验摘要和来源，不因它是 JSON 就默认可信。

### 5. 脚本与信任边界的验证顺序

先冻结“输入 → 授权 → VM/原生代码 → 宿主桥 → 本地状态/外部接口”的威胁模型，区分未授权工作台内容、已授权沙箱脚本、已授权原生项目代码、匿名演示访客与运维者。签名有效只说明来源/完整性，不等于行为安全；analytics consent、AI consent、模型外连信任和代码执行同意不能互相替代。

| 测试面 | 关键正反例及可观察结果 |
| --- | --- |
| Guest 隔离 | 正常 SDK 行为运行；不能取得 DOM、网络、宿主 Function/eval 权限或另一 context 的对象；动态 import/属性链不能得到未授权宿主能力 |
| 全部 guest 执行入口 | 覆盖 loadScript/setup/handler、getter/Proxy/toJSON、结果/错误 dump、异常路径及嵌套回调；超时必须可观察、停止后不再产生后续写入，不只验证 `while(true)` |
| 宿主桥接 | 未知 op/伪造 handle、跨实例 handle、`__proto__`/constructor、NaN/Infinity、深/宽/循环数据、超长日志和大返回值；明确深度/字节/数量预算及拒绝行为，检查重入不能刷新外层预算 |
| 资源耗尽 | 栈、guest heap、共享堆、宿主分配、调度/订阅/消息队列、多脚本累计 tick 耗时；区分单次 5 ms 与页面整体上限；不能宣称 guest 32 MiB 覆盖整个浏览器内存 |
| 故障恢复 | poison 只通知一次、无每帧重建循环；OOM 后验证共享 runtime 中其他组件与重启语义；若要把故障提升为 runtime 级隔离，须明确兼容影响 |
| 生命周期 | 改代码、撤销同意、模型切换、加载取消、异步 WASM 到达、hot reload、插件销毁、DES/连续仿真切换；旧代际不可重新挂接、无遗留订阅/宿主写入/句柄增长 |
| 授权与来源 | URL 请求不能自行形成同意；A 内容批准不放行 B；同项目 ID 换代码重新评估；无对话框/存储损坏/未知授权版本拒绝执行；原生代码依旧明确展示其权限 |
| 工业边界 | 不可信模型可按既有规范作本地仿真，但不能自动外连/绑定真实信号；用 Mock/隔离网关证明未授权写调用数为零。脚本启用不能提升为 PLC/MCP 写权限 |
| 发布入口 | WEB 工作台、受保护演示、单文件播放器分别验证；后两者继续在导出/发布和加载两端拒绝可执行模型内容 |

对可能挂死浏览器的案例采用一次性进程/上下文，由独立于被测 JS 线程的 watchdog 限时结束并记录失败；不得把主线程已阻塞时不会运行的 timer 当安全保护。只结束本次创建的进程。重复与生成式畸形输入使用固定种子和有界规模，先在隔离 fixture 中运行。

建议先补齐同一架构内的入口预算、桥接约束和错误处理。QuickJS interrupt 不能直接抢占任意宿主同步函数；必须减少/限制这些操作并验证。如果证据表明同步架构无法满足可恢复性，再提交 Worker/消息契约的独立 ADR 和性能/固定 Tick 对照；本计划不预先保证“完全无卡顿”。

D3 的具体兼容建议：保留 `?scripts` 作为请求入口，取消其直接授信能力；有效部署策略决定能否申请，当前模型/项目内容的授权决定是否执行。原生项目代码按项目 ID、执行模块集合及内容摘要绑定同意，首次升级旧记录不静默提升为新授权，代码变化需重新同意；拒绝或摘要无法获得时仍可打开模型，代码保持关闭。内置构建插件仍走经过审查的构建信任路径。该迁移在 ADR、规格、UX/i18n 和测试同时落地，不偷改已有存储 key 或脚本 SDK。

### 6. 内部报告与第三方渗透测试

M3 产出内部报告、复现 fixture、修复/复测记录及受限测试环境；明确标注报告来源是项目内部。M4 由独立测试方出具正式报告，不以扫描器 HTML 或 AI 总结充当第三方报告。

委托范围建议使用 [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs) 的适用 L2 控制作为需求基线，使用 [WSTG 4.2](https://owasp.org/projects/web-security-testing-guide) 组织测试方法，再增加本项目的 QuickJS/宿主桥专项。逐项给出适用、不适用与未测原因，不宣称自动获得 OWASP 认证。

测试任务书至少覆盖：

1. 浏览器恶意模型/项目脚本入口、同意与来源混淆、沙箱和宿主能力边界、资源耗尽及数据泄露。
2. 实际 Appliance 上的访客/运维权限、逐请求资源授权、分享撤销/到期、会话/CSRF/Origin、路径穿越/上传解析、限速、CSP、WebSocket、备份恢复后的失效语义。
3. CONNECT/MCP/调试入口的暴露与鉴权边界；仅对明确许可的实验环境检查，原生代码拥有页面权限的事实必须列为前提，不能声称 QuickJS 保护原生插件。
4. 制品来源、依赖/许可证证据、部署默认配置；第三方闭源服务只声明受测接口与供应商责任，不推断其内部安全。

启动前冻结 commit、全部 artifact digest、目标拓扑、测试账户与角色、测试窗口、允许动作、停止条件、恢复方式和脱敏要求。完整报告保存在受控交付位置，公共仓库仅放脱敏摘要和证据索引。验收必须含覆盖矩阵、复现步骤/影响/分级、修复版本、复测结果与残余风险签收。建议正式交付前无未关闭 Critical/High；其他风险具名接受并定期复查。重大授权/沙箱/服务端变化应重新评估复测范围，旧报告不能无限覆盖后续版本。

## State Ownership and Compatibility

- 扫描策略、许可复核、限期例外、第三方来源登记由版本控制的安全配置拥有；生成清单和报告由脚本生成，不手改。建议实现目录 `scripts/security/`、`security/` 与 `docs/architecture/`/`docs/acceptance/`/`docs/delivery/`，具体 schema 在 M0 冻结。
- 临时证据进 `test-results/security/`，客户交付证据与准确版本和 manifest 绑定；敏感测试细节留在受控报告位置。不会把扫描状态写入 GLB、项目、用户配置或运行时信号。
- 原有 CycloneDX 1.5 路径与 Appliance Bundle 保持兼容，补齐正确包身份/关系/证据；确需新增强制 manifest 字段时按现有契约升级规则评审，不从本计划自行引入破坏性变更。
- D3 是浏览器代码同意记录及授权行为变化，必须版本化迁移；GLB/rv_extras、NodeId、项目/文档 ID、资产引用、脚本 API、固定 Tick 和 PLC 方向均保持。新增安全字段仍由部署层拥有，项目/URL 不得抬高权限。

## Allowed Paths

实施范围如下；开始时仅本计划草案和索引有本任务改动，无其他工作树变更：

- `scripts/verify.sh`、`scripts/security/**`、`security/**`、`.github/workflows/quality-gates.yml`，以及经批准的定时扫描配置。
- `package.json`、`package-lock.json`，仅限选定扫描工具与经评审的依赖修复。
- `scripts/build-offline-appliance.mjs`、`scripts/build-demo-player.mjs`、实际构建资源清单输出点、`appliance/dependencies/**`、`appliance/licenses/**`。
- `src/core/engine/rv-script-sandbox.ts`、`rv-script-host.ts`、相关 registry、`src/core/sdk/**`、`src/plugins/web-component-plugin.ts`、DES 脚本入口。
- D3 接受 ADR 后的 project consent、模型信任与原生脚本加载路径、部署配置、最小 `src/main.ts` 接线及对应 schema/i18n/UI。
- 对应 `tests/`、隔离生产旅程脚本、治理/ADR/规格/契约/验收/运维文档及索引。

## Forbidden Paths

- 实施时仍不得改无关业务模块、覆盖用户改动、修改 LICENSE 权利声明、手改生成文件/产物或放宽既有测试。
- 不写私有 sibling、客户模型、生产配置/凭据、真实设备或未获授权的外部服务；需要触及上列允许范围之外的架构先更新范围和 ADR。

## Milestones

### M0 — 决策与可执行规范

确认 D1–D5，记录批准来源；形成供应链策略、脚本信任 ADR/契约、威胁模型、验收矩阵和许可证复核责任人。扫描工具先验证版本/Node 兼容、许可证、自检输入和数据外发边界，再锁定。当前工作树中未知的真实漏洞数与许可义务在这里建立基线，不能沿用历史截图。

交付：Approved 的实施依据、明确问题清单/负责人、最小黄金切片及本地命令。验证：governance；不存在批准依据的分支保持 proposed。

### M1 — 公共依赖黄金切片与第六门禁

从当前公共 lockfile/安装树生成完整 npm 清单、漏洞/许可报告；解决阻断项或逐项获准限期例外，接入同一个 Harness。使用有已知 advisory 的离线报告 fixture、缺许可/错误表达式/过期例外/工具故障 fixture 证明能红，再以当前真实公共依赖扫描证明能绿。fixture 证明判定器，真实查询证明接口，两者不混用。

交付：`Supply Chain Gate` 配置、报告、策略自检与本地入口；公共干净 checkout 无 private sibling 也能运行。验证：governance/static/node/build；经授权的候选 PR 运行与分支保护读回。未操作远程时仅交付本地实现，不宣称已强制。

### M2 — 脚本黄金切片及加固

先建立“正常脚本可运行 → 恶意/未授权行为被拒 → 错误可见 → 关闭/切换后干净 → 修正后可再运行”的真实 VM 与生产浏览器旅程，再展开第 5 节矩阵。对每个确认问题先保留最小失败复现，再修复。D3 的授权变化按 Accepted ADR 迁移，任何缺少证据的怀疑标为待验证。

交付：威胁/用例追踪表、已确认问题与修复、迁移说明、内部安全报告。验证：static/node、聚焦 Browser、全量 browser/build、隔离生产旅程；观察异常后的宿主状态/写调用/内存与句柄，并给出正常 Tick 路径性能对照，不更改仿真语义。

### M3 — 发布制品证据闭环与运维流程

将 M1 清单扩展到实际 WEB/播放器/Appliance 交付字节，纳入 WASM/补丁/字体和 OS/原生依赖，补齐 notices 与人工许可义务记录。某目标输入缺失就保持该目标未验收。建立新漏洞分诊、支持版本复扫、修复发布、客户通知模板和报告留存流程；任何外部通知另行授权。

交付：每个受支持目标的 SBOM、THIRD-PARTY-NOTICES/正文、漏洞与许可结论、例外、摘要关联；内部安全证据与第三方测试任务书。验证：`all`（含新增供应链 scope）、构建后清单差异/遗漏/摘要错误反例、Appliance/演示包/离线聚焦旅程；客户断网启动无新增扫描外呼。

### M4 — 独立渗透测试、整改和复测

Owner 落实测试方与授权，按冻结的任务书在隔离环境执行。整改安全发现，保留可进入 CI 的回归；机构复测并出具报告，Owner 签收残余风险。仅内部测试完成时本里程碑仍未完成，不据此关闭整个企业安全交付项。

## Progress

- [x] 只读核对治理、当前门禁、依赖/交付基础和脚本相关代码。
- [x] 起草本方案，登记历史材料与当前实现的差异。
- [x] 用户认可方案与 D1–D5；M0 形成 ADR-0019、安全规范、验收矩阵和运维任务书。
- [ ] M1 公共依赖门禁落地并验证强制性。
- [ ] M2 脚本安全测试与经批准加固完成。
- 本地 M2 实现、真实 VM 专项、生产授权旅程及完整 Browser 已通过；等待修复提交的远程门禁结果后确认里程碑。
- [ ] M3 实际发布制品证据、许可证义务和运维流程闭环。
- [ ] M4 独立测试及复测报告验收。

## Surprises & Discoveries

- 路线图所说“缺供应链门禁”仍成立，但“没有基础设施”不准确：Appliance 已产 SBOM，播放器已有部分 notice；采用复用与补齐，避免平行实现。
- `consent-store.ts` 实为 analytics consent；原生项目代码不经过 QuickJS，授权仅按项目 ID。不能仅加固两个 VM 文件就声称用户脚本入口安全。
- `?scripts` 在当前组合根中直接开启执行；资源 deadline 并未在源码层覆盖所有取值/序列化路径。两点进入优先验证和决策范围，尚不记为已确认可利用漏洞。
- 历史路线图的“无服务端”已被 ADR-0009/0012 与 Appliance 实现推进；渗透测试范围必须包含现有服务端和访客访问控制。
- 方案阶段未执行扫描。实施基线 npm audit 有 29 项（High 17/Critical 3）；2026-10-22 修复与工具加入后的候选树复扫为 4 项 High（同一 braces advisory 及上游链），Critical 为 0。900 条依赖路径全部对账，100 条许可证正文/义务复核失败。数字仅对应本次输入摘要，后续必须重新扫描；例外文件保持为空。
- npm 10.9.7 对选定传递依赖执行更新时出现 `Cannot read properties of null (reading 'edgesOut')`。采用既有 semver 范围内重新解析锁文件，另对 sharp、handlebars、DOMPurify 明确选定修复版本；没有使用 `audit fix --force`。这也刷新了较多传递依赖，锁文件差异及全量回归必须单独审阅。已恢复与修复无关的 React、虚拟列表、stats-gl 版本，保留 Monaco 原范围，避免无关升级带来的兼容和体积回归。
- 首轮全量 Browser 的失败集中在 3 条既有 bundle 体积断言（入口 3,599,283 字符，预算 3,520,000）。未提高预算；恢复其余无关直接依赖版本，并让 QuickJS 宿主和脚本编辑面板分别按显式启用/首次打开加载。最终入口 3,500,413 字符。原测试误把 Monaco chunk 称为 asset editor；随实际拆分更新为验证 entry → ScriptEditorPanel → Monaco 两条可达边，同时保留原体积断言。
- 远程生产授权旅程发现 GPU 自动质量对话框会晚于 model-loaded 出现，原一次性可见性检查会漏掉它。改为 Playwright locator handler 点击真实确认按钮，保留全部授权与执行次数断言。本地生产旅程已通过。
- 5 ms VM 默认预算的冷启动路径会受 WASM tier-up 影响。只在全新 context 内用可信常量和 inert callback 预热实际生命周期/数据读取路径，用户代码与真实能力仍受原 deadline。原始字符串先核对长度再分配宿主字符串；参数转换后、调用宿主副作用前再校验 deadline。新增真实 Proxy 转换耗尽预算后写入次数为 0 的回归，未放宽期限或已有 poison 断言。
- 原生制品须用 Trivy rootfs 路径；源码目录 fs 扫描不能替代它。对锁定 Caddy 的真实二进制和包含同一文件的本地测试镜像分别扫描，两者均识别 146 个包，但主模块版本缺失且有漏洞，按 incomplete 阻断；镜像仅验证适配器，不代表完整 Appliance。
- 合并前读取远程 `f03e399` 结果，Browser 授权旅程仍因首次 SDK setup 超过 5 ms 失败，本地性能采样复现。此前 bare noop 预热未覆盖真实参数读取、预算检查与返回值转换；补齐使用同一桥接实现的可信常量预热，独立限时 1 秒且不运行用户代码/能力，不改变用户预算、poison 或生产旅程断言。新增默认预算下首次 SDK setup 与初始化入口不泄漏的回归。
- 后续 `9ba0603` 的远程 Browser 和本地 2 倍 CPU 降速采样仍复现首次 SDK setup 超时，通用桥接预热未覆盖 SDK 构造/分派/包装。补充每个 host 一次、独立临时 context 的固定 SDK 初始化；不接入调用者环境，每次调用限时 1 秒并释放全部句柄。保留用户 5 ms、生产执行次数和 poison 断言，增加初始化后无限 setup 仍超时且无信号写入的回归。

## Decision Log

| 日期 | 事项 | 批准依据 / 状态 |
| --- | --- | --- |
| 2026-10-20 | 只起草 L3-3 方案，认可后再实施 | 用户当前明确请求；本轮不扩展为实现授权 |
| 2026-10-20 | D1–D5 与范围内实施、开 PR | 用户明确“同意，开 pr 实施”；接受 ADR-0019，记录 OD-008；不包含采购、部署或未经单独授权的远程保护设置 |
| 2026-10-22 | 合并 PR #18 到 develop 并删除对应功能分支 | 用户明确“完成 pr merge。功能开发分支可可删除了”；保留供应链风险和未验收里程碑，不等于正式发布或许可证豁免；仍按远程受保护门禁完成合并 |

## Validation

方案阶段验证（2026-10-20）：`./scripts/verify.sh governance` 退出 0；Harness 自检、128 份治理文档检查、文档可发布检查、兼容性生成物一致性和 Git whitespace 检查通过。工作树变化仅本方案与 proposed 索引。静态读取不替代测试；未运行全仓 Static/Node/Browser/Build、漏洞扫描或攻击测试，这些不是本轮方案交付的验证范围。

实施阶段本地验证（2026-10-21，含后续修复）：

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 2026-10-22 文档补齐后通过，132 份治理文档、发布链接及生成物检查通过 |
| `./scripts/verify.sh static` | Lint、模块边界及 TypeScript 通过 |
| `./scripts/verify.sh node` | 86 文件、877 条通过；随后增加的未知原生版本反例在对应 2 条测试中再次通过 |
| `./scripts/verify.sh build` | 主应用、访问服务和演示播放器构建通过；入口体积低于原预算 |
| `./scripts/verify.sh browser` | 8 分片与独立性能文件全部通过，共 11,054 条通过；已有 12 条 skip、2 条 todo，本任务未新增跳过 |
| `node scripts/security/test-script-boundaries.mjs` | 外部 watchdog 下真实 Chromium/QuickJS，7 文件、86 条通过 |
| `node scripts/security/test-script-production.mjs` | URL 不执行、显式 UI 确认执行一次、撤销释放、换模型重新确认、部署禁止优先，五项通过；无外部请求/页面异常 |
| `./scripts/verify.sh supply-chain` | 2026-10-22 复扫：10 条策略自检通过；900/900 路径完整，4 High/0 Critical、100 条许可证失败、无工具错误，退出 1；未批准或添加例外 |
| Trivy 适配器 | Linux arm64 工具真实运行；x64 归档与二进制摘要已核对但未执行。2026-10-22 00:11 UTC 复扫真实 Caddy 原生目录及本地测试镜像，均 146 包、50 条记录（23 High/21 Medium/5 Low/1 Unknown），主模块版本缺失，退出 2。DB 更新时间 2026-10-21 01:19 UTC，扫描时仍处于 24 小时/NextUpdate 窗口内 |

上述为开发候选树的内部证据，不是干净发布制品的审核签收。上一远程候选 `65e1b29` 的 Governance/Static/Node/Build/Windows Chrome、Edge 兼容性通过；Supply Chain 因实际债务失败，Browser 在生产授权旅程的晚到 GPU 对话框处失败，未运行后续全量 Browser。后续修复的远程结果单独查询 PR，不将旧提交状态移用到新提交。`all` 未通过，M1 的远程强制设置、M3 的全部目标/分发复核和 M4 独立报告仍未验收。

2026-10-22 合并前读回 develop 分支保护：required contexts 为 Governance/Static/Node/Browser/Build，enforcement 为 everyone；rulesets 为空。Supply Chain 尚未加入远程 required contexts，此轮未修改保护设置。`f03e399` 的原四项门禁和 Windows 兼容性通过，Browser 在生产 setup deadline 处失败；对应修复后 7 文件、87 条脚本专项通过，其余候选验证继续记录于 PR。

`9ba0603` 的 Windows 首次执行在 Edge 最后一个 WebGPU fallback 旅程遇到本地预设请求耗时 5–49 秒，保留 trace 后一次新 runner 复验通过；Browser 则再次确认首次 SDK setup 超时。SDK 初始化补齐后的本地验证：脚本 watchdog 7 文件/88 条、SDK 回归 8 文件/59 条、Governance/Static/Build、正常生产授权旅程全部通过；相同的 2 倍 CPU 降速与性能采样复现从失败转为通过。最终提交的远程结果仍须单独验证，不能由本地结果代替。

实施验收必须覆盖：

- Gate 正反例：无漏洞/有漏洞、准确许可/未知/冲突、过期例外、工具错误、网络失败、报告缺失/篡改、平台 optional 未安装、重复版本与 scoped 身份。
- 清单完整性：安装树与 lockfile 差异、构建图中的 dev 依赖、嵌入 WASM/复制资源、镜像内依赖、补丁后摘要；不支持的输入显式失败或保持未验收。
- 真实 VM 与生产构建的第 5 节安全矩阵；无重试碰绿、无跳过掩盖、无修改测试去迁就缺陷。
- 原五项门禁与新的 supply-chain scope；脚本兼容、错误诊断、正常 Tick 性能、保存重开和同意迁移；实际发布目标的离线/访问控制/演示包回归。
- 远程 required check 的配置/强制证据与本地证据分别记录；真实客户内网/设备/未提供平台结果单独披露。
- 第三方报告、整改与复测是否齐全，和自动化门禁结论分开签收。

## Rollback

方案阶段仅新增文档；实施阶段已有运行时、consent、门禁和依赖变更，不能沿用“无运行时变化”的回滚描述。

实施拆成可审查的小变更：工具/门禁、VM 修复、同意迁移、发布证据分别回退。不能靠取消 required check 或永久豁免回滚为绿色；门禁故障应失败并修复工具或使用获批限期处理。回退漏洞依赖/沙箱修复前必须复核风险，必要时停止该版本交付。

同意记录迁移保留旧格式可识别信息，但回退到旧客户端可能重新采用旧的宽松授权语义；需禁用相关执行入口或向前修复，不能只回滚 JS 文件就声称安全。已经生成的客户报告/SBOM保留其版本记录，旧报告不得用于新制品；第三方及远程设置变更按授权单独回退并读回。

## Outcomes & Retrospective

当前已获准实施；结果与证据随里程碑更新。远程强制、真实平台和独立渗透测试分别验收。按 M0–M4 推进，逐项补真实证据；在取得正式报告前不关闭企业交付的安全证据缺口。

## Implementation record — PR #18

- [PR #18](https://github.com/OwnDing/realvirtual-WEB/pull/18) 是本计划的草稿实施 PR，基础提交 `0700922`。
- 已增加 Supply Chain Gate（五项原门禁保留）、固定工具版本、全量包/平台清单、SPDX 判定、例外/分诊校验、CycloneDX schema 验证与失败报告。基线债务不自动豁免。
- 已修改内容绑定的原生 consent、工作台当前模型确认、部署脚本上限、QuickJS 整体调用预算及有界序列化。增加 SDK 资源预算、关闭后释放、计时事件风暴与异步授权竞争回归；最终候选提交的验证结果另列在 Validation。
- 发布文件集/摘要/构建输入图与校验器、固定版本/摘要的 Trivy 本地镜像及原生目录适配已实现。扫描器真实试跑使用锁定的 Caddy 二进制和隔离测试镜像，未运行目标；主模块版本缺失与已有漏洞均保持阻断。复制资产、内嵌库、全部 OS/原生目标审计和实际分发义务尚未获得逐目标证据，M3 未关闭。
- 尚无第三方报告或机构/目标授权，M4 未关闭。远程 required check 尚未修改。
- 扫描/测试报告保留在 `test-results/security/`；不把 dirty checkout 的报告当正式发布证据。验证结果随候选提交更新。
