---
doc_id: GOV-OPEN-DECISIONS
title: 当前未决事项与实施闸口
status: approved
owner: architecture
last_reviewed: 2026-08-27
authority: normative-registry
---

# 当前未决事项与实施闸口

本文件只登记“谁必须决定什么、阻塞什么”，不替代 ADR、产品规格或契约。Agent 不得自行关闭下列事项。

| ID | 决策 | Owner | 阻塞范围 | 状态 |
| --- | --- | --- | --- | --- |
| OD-001 | 平台边界是浏览器/本地优先，还是包含账户、组织、权限、云端资产与审计服务 | product、architecture | 新服务端、租户/组织模型、云端项目后端 | decided-pending-spec |
| OD-002 | 首批 `zh-CN`/`en-US`、默认与最终回退中文、AI 直接翻译、locale 格式化范围 | product、ux | 已落入 `PS-I18N-001`；运行时架构仍需 ADR 和 Active ExecPlan | closed |
| OD-003 | 部署、项目、文档、模型、用户和会话配置的可覆盖字段及优先级 | product、architecture | 统一配置 Schema、编辑 UI 和迁移 | open |
| OD-004 | Snap 名称约定向稳定端口 ID/约束元数据演进的兼容方案 | product、architecture | 已落入 `PS-PLANNER-001`、`ADR-0003` 与端口契约 | closed |
| OD-005 | 新 Quality Gates 在远程 CI 的必需检查名称和分支保护策略 | maintainers | 把 CI configured 状态升级为 enforced | closed |
| OD-006 | 根目录 22 份 `doc-*.md` 的逐份审计、迁移和 Approved 清单 | architecture、engineering | 将旧文档从 reference 提升为正式依据 | open |
| OD-007 | 自有离线授权系统的强制力边界：在 AGPL-3.0-only 前提下，许可证校验是「合同凭证 + 防篡改审计记录」还是「技术强制」；绑定维度（部署域名 / 部署身份 / 机器指纹）、有效期与宽限期长度、到期降级形态（只读、水印或两者）、并发上限在浏览器端的可执行性，以及是否保留上游 CONNECT 授权查询 | product、security | 替换 `src/core/hmi/license-store.ts` 的 CONNECT 授权查询、许可证文件契约、功能位与并发上限强制点、到期行为、销售合同条款 | closed |

## 执行规则

1. 任务碰到阻塞范围时，ExecPlan 必须引用对应 OD。
2. 决策完成后创建或更新 ADR/产品规格/契约，再把状态改为 `closed`。
3. 关闭记录必须包含日期、批准人或批准来源、落地文档和需要同步的代码/测试。
4. 未触及阻塞范围的工作可以继续，不能把“有未决事项”当成无限暂停理由。

## 决策落地记录

- 2026-08-19，用户当前明确指令确认 OD-002 的部分产品输入：首批正式语言为中文、英文，默认语言为中文。
- 2026-08-19，用户确认进入下一步并明确翻译直接由 AI 完成；结合上一轮待确认方案，规范 locale 为 `zh-CN`/`en-US`，回退链为当前语言 → `zh-CN` → 稳定 key 与诊断，日期和数字随当前 locale，工业单位和稳定 ID 不本地化。
- OD-002 于 2026-08-19 关闭。批准来源为用户当前明确指令，落地文档为 Approved [`PS-I18N-001`](../product-specs/MULTILINGUAL_LOCALIZATION.md)；运行时框架、目录、偏好存储和测试由 Proposed `ADR-0001` 与 `EP-I18N-001` 继续约束，不把产品决策关闭解释为代码已经实现。
- 2026-08-19：[`ADR-0001`](../adr/ADR-0001-i18n-runtime.md) 接受，[`EP-I18N-001`](../exec-plans/completed/EP-I18N-001-incremental-foundation.md) 当时激活，批准来源为用户当前明确指令。上一条中的「Proposed `ADR-0001`」记录的是当时状态；该计划的后续完成状态见下一条，OD-002 始终保持 closed。
- 2026-08-21：用户当前明确指令批准完成最后两批、运行并修复 CI、关闭 `EP-I18N-001`。八类受门禁库存归零、入口预算保持且远程 Quality Gates 留证后，[`EP-I18N-001`](../exec-plans/completed/EP-I18N-001-incremental-foundation.md) 转为 completed，KD-001 关闭；OD-002 继续保持 closed。
- OD-005 于 2026-08-23 关闭。批准来源为用户当前明确指令（保护 `main`、五项检查全选、管理员不可绕过）。已对 `main` 配置：required checks = `Governance Gate`/`Static Gate`/`Node Gate`/`Browser Gate`/`Build Gate`，`strict`（合入前分支须为最新）、`enforce_admins`、禁止强推与删除；**未要求 PR review**——单人仓库无法自审，要求 review 会使 `main` 完全不可合入。落地记录见 [`EP-GOV-004`](../exec-plans/active/EP-GOV-004-gate-that-gates.md) M2。
  同日维护者追加决定同样保护 `develop`，配置与 `main` 完全一致（API 复核：两个分支均为 checks=5、strict、enforce_admins、禁止强推与删除、不要求 review）。该追加正是针对本项的触发证据——`f012911` 与 `2c42c21` 的 Browser Gate 连续两次红、两个提交仍被推入 `develop`；只保护 `main` 无法阻止该情形重演。
  **工作方式变更（本决定的直接后果）**：两个分支都不再接受直接 push。任何改动必须走特性分支 + PR，并等五项 Gate 全绿方可合入（Browser Gate 约 9 分钟）。管理员亦不可绕过。

- 2026-08-23，用户当前明确指令确定 OD-001 的产品方向：**平台边界包含账户、组织、权限与云端资产**，不是纯浏览器/本地优先。该决定改变 OD-003（分层配置的作用域是组织而非单机）与资产库版本/团队发布的设计前提，因此先行记录，使后续规格不按错误假设开工。
  OD-001 状态改为 `decided-pending-spec` 而非 `closed`：按本文件执行规则 2，产品决策必须先落到 ADR/规格/契约才可关闭。落地文档（租户/组织模型、权限模型、云端项目后端契约）尚未创建，创建并批准后再改为 `closed`。此处沿用 OD-002 的先例——2026-08-19 曾同样先记录部分产品输入，规格落地后才关闭。

- OD-004 于 2026-08-22 关闭。批准来源为用户当前明确同意五项改进并要求按 ExecPlan 完成；落地文档为 Approved [`PS-PLANNER-001`](../product-specs/PAINTLINE_ASSEMBLY_MVP.md)、Accepted [`ADR-0003`](../adr/ADR-0003-stable-assembly-ports.md) 与 [`CONTRACT-ASSEMBLY-PORTS-001`](../contracts/ASSEMBLY_PORTS.md)。Schema、代码、资产和测试已由 Completed [`EP-PLANNER-001`](../exec-plans/completed/EP-PLANNER-001-paintline-assembly-mvp.md) 同步交付并留证。

- 2026-08-25，用户当前明确指令批准 OD-003 的**部署层子决策**：品牌、法律链接、外部服务和外呼策略由版本化部署配置拥有；默认拒绝外部访问，显式使用 `origin + purpose` allowlist；项目、模型、用户、会话与 URL 参数不得放宽这些安全字段。落地文档为 Approved [`PS-CONFIG-001`](../product-specs/DEPLOYMENT_IDENTITY_EGRESS.md)、Accepted [`ADR-0006`](../adr/ADR-0006-deployment-identity-egress.md) 与 [`CONTRACT-DEPLOYMENT-CONFIG-001`](../contracts/DEPLOYMENT_CONFIG.md)，实施由 Completed [`EP-CONFIG-001`](../exec-plans/completed/EP-CONFIG-001-deployment-identity-egress.md) 交付。OD-003 保持 `open`：非安全配置在部署、项目、文档、模型、用户和会话之间的完整覆盖矩阵、组织策略编辑 UI 与迁移仍未决定。

- 2026-08-26，用户当前明确指令记录 OD-007 的产品输入：私有化部署客户内网无法访问本项目服务器，因此授权必须**离线可校验**；需要签名许可证文件（绑定域名或机器指纹、有效期、功能位、并发上限）、宽限期与降级策略（工业场景不接受「过期即黑屏」，应退化为只读或加水印），以及一份写进合同的到期行为说明。用户同时指出 `src/core/hmi/license-store.ts` 当前通过 `connectRestFetch` 查询的是**上游 CONNECT 的授权体系**，不属于本项目；`src/core/persistence/rv-sig-public-key.ts` 的信任根是上游公钥，其私钥在上游 `RV_SIGN_PRIVATE_KEY` 发布密钥中，本项目需要自有密钥对。
  OD-007 状态记为 `open` 而非 `decided-pending-spec`：上述是需求输入，不是强制边界决定。仍未决的是「AGPL 下强制到什么程度」、具体绑定维度、宽限期天数、降级形态与并发上限的可执行范围，以及上游 CONNECT 授权查询的去留。按本文件执行规则 2，这些必须先落到 ADR、产品规格与契约才可关闭。

- OD-007 于 2026-08-27 关闭。批准来源为用户当前明确指令，逐项决定如下：
  1. **宽限期 30 天**（超期后 30 天内全功能 + 不可关闭横幅 + 水印，之后才降为只读）。
  2. **绑定两个维度都要**：许可证同时携带 `installId` 与 `hosts[]`，两者都比对。二者仍是审计断言而非锁——`settings.json` 由客户托管且失败即开（`rv-app-config.ts:244-259`），浏览器内不存在硬件指纹（`rv-gpu-info.ts:12-19`）。
  3. **删除上游 CONNECT 授权查询**：`/license/status`、`/license/register`、`/license/activate`、`/license/deactivate` 及其 UI 与文案整体移除。网关自身的授权问题仍由网关 `/status` 独立上报（`connect-store.ts:832` 的 `LICENSE_REQUIRED`、`:862` 的 `SignalLimitExceeded`），因此运维不会失明；失去的只是绑定信号前的额度预览与 Add 按钮预检闸（该闸本就失败即开）。
  4. **确认强制力边界表述**：本系统是「合同凭证 + 防篡改审计记录」，不是技术 DRM；该表述进入销售合同文本。依据 `LICENSE:193`（交付、支持与保证可收费）、`LICENSE:451`（不得对 AGPL 已授予的权利额外设限）与 `LICENSE:376`（附加限制条款接收方有权删除）。
  落地文档为 Accepted [`ADR-0007`](../adr/ADR-0007-offline-license-evidence.md) 与 Completed [`EP-LICENSE-001`](../exec-plans/completed/EP-LICENSE-001-offline-license.md)——两者均于 2026-08-27 依用户当前明确指令转为生效状态，计划于 2026-08-28 完成交付。
