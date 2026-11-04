---
doc_id: ADR-INDEX
title: 架构决策记录
status: approved
owner: architecture
last_reviewed: 2026-11-04
authority: normative-process
---

# 架构决策记录

ADR 用于记录会长期影响多个模块、状态所有权、安全边界或不可逆契约的决策。编号采用 `ADR-0001-short-title.md`。

`adr_status` 使用 `proposed`、`accepted`、`rejected`、`superseded`。提议阶段文档为 `status: draft`；接受后改为 `status: approved, adr_status: accepted`。只有 Accepted ADR 具有规范效力。

- [`ADR-0001-i18n-runtime.md`](ADR-0001-i18n-runtime.md)：Accepted（2026-08-19），选择多语言运行时、静态目录、偏好存储与回退边界。
- [`ADR-0002-overhead-conveyor-accumulation.md`](ADR-0002-overhead-conveyor-accumulation.md)：Accepted（2026-08-22），悬挂链积放（power-and-free）的状态模型——按载具行进者取代单一链相位标量，作为可选模式。
- [`ADR-0003-stable-assembly-ports.md`](ADR-0003-stable-assembly-ports.md)：Accepted（2026-08-22），稳定 `AssemblyPort` 身份、方向与旧 `Snap-*` 双写兼容迁移。
- [`ADR-0004-public-smart-asset-authoring.md`](ADR-0004-public-smart-asset-authoring.md)：Accepted（2026-08-22），公开智能资产编辑复用统一文档、GLB/`rv_extras` 权威与统一保存链路。
- [`ADR-0005-public-domain-neutral-des.md`](ADR-0005-public-domain-neutral-des.md)：Accepted（2026-08-22），公开 DES 采用行业无关内核、宿主/UI 适配层和可注册 MaterialFlow 扩展。
- [`ADR-0006-deployment-identity-egress.md`](ADR-0006-deployment-identity-egress.md)：Accepted（2026-08-25），部署身份/服务/外呼策略由版本化部署配置拥有，外部访问默认拒绝并按 origin/purpose 授权。
- [`ADR-0007-offline-license-evidence.md`](ADR-0007-offline-license-evidence.md)：Accepted（2026-08-27），自有离线许可证作为部署层合同凭证与防篡改审计记录，而非技术强制；载荷字节直签、自有信任根、到期只降级创作不降级运行。
- [`ADR-0008-unified-configuration.md`](ADR-0008-unified-configuration.md)：Accepted（2026-08-29），双平面四层配置、部署策略上限、项目 modelProfiles 与版本迁移。
- [`ADR-0009-offline-appliance.md`](ADR-0009-offline-appliance.md)：Accepted（2026-08-30），完整离线 Appliance 的双运行模式、HTTPS 入口、服务拓扑和持久状态边界。
- [`ADR-0010-versioned-upgrades.md`](ADR-0010-versioned-upgrades.md)：Accepted（2026-08-31），N-2 兼容窗口、发行清单版本门、服务器/浏览器双层备份和 rollback/restore 边界。

`ADR-0001` 至 `ADR-0010` 均为 Accepted。`ADR-0010` 的实施已由 Completed [`EP-UPGRADE-001`](../exec-plans/completed/EP-UPGRADE-001-versioned-upgrades.md) 交付并留证；`ADR-0009` 的实施由 Active [`EP-APPLIANCE-001`](../exec-plans/active/EP-APPLIANCE-001-offline-appliance.md) 驱动。`ADR-0008` 的实施已由 Completed [`EP-CONFIG-002`](../exec-plans/completed/EP-CONFIG-002-unified-configuration.md) 交付并留证；`ADR-0007` 的实施已由 Completed [`EP-LICENSE-001`](../exec-plans/completed/EP-LICENSE-001-offline-license.md) 交付并留证，其产品决策依据是已关闭的 `OD-007`。`ADR-0001` 的实施已由 Completed [`EP-I18N-001`](../exec-plans/completed/EP-I18N-001-incremental-foundation.md) 交付并留证；`ADR-0002` 的实施已由 Completed [`EP-CONV-001`](../exec-plans/completed/EP-CONV-001-overhead-conveyor-accumulation.md) 交付并留证；`ADR-0003` 的实施已由 Completed [`EP-PLANNER-001`](../exec-plans/completed/EP-PLANNER-001-paintline-assembly-mvp.md) 交付并留证；`ADR-0004` 的实施已由 Completed [`EP-ASSET-001`](../exec-plans/completed/EP-ASSET-001-smart-asset-editor.md) 交付并留证；`ADR-0005` 的实施已由 Completed [`EP-DES-001`](../exec-plans/completed/EP-DES-001-public-domain-neutral-des.md) 交付并留证。ADR 本身不单独授权执行计划范围外的全仓迁移。创建场景见 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

- [ADR-0011-offline-runtime-gate.md](ADR-0011-offline-runtime-gate.md)：Accepted，离线部署预设与生产网络验收。

- [ADR-0012-protected-presentations.md](ADR-0012-protected-presentations.md)：Accepted，客户 Appliance 演示资源访问控制。

- [ADR-0013-single-file-demo-package.md](ADR-0013-single-file-demo-package.md)：Accepted，单文件演示快照与声明式离线导览。

- [ADR-0014-progressive-loading.md](ADR-0014-progressive-loading.md)：派生性能包与会话自适应画质。

- [ADR-0015-visual-presentation.md](ADR-0015-visual-presentation.md)：视觉呈现与有界媒体导出。

- [ADR-0016：部署白标统一解析与交付投影](ADR-0016-deployment-white-label.md)

- [ADR-0017：本地诊断采集与导出边界](ADR-0017-local-diagnostics.md)

- [ADR-0018：兼容性规则与认证证据](ADR-0018-compatibility-evidence.md)

- [ADR-0019：供应链证据与内容绑定的代码执行授权](ADR-0019-supply-chain-and-script-trust.md)：用户于 2026-10-20 批准 EP-SEC-001 后接受。

- [ADR-0020：离线帮助与错误展示](ADR-0020-offline-user-help.md)

- [ADR-0021：AGPL 商业交付与独立发行身份](ADR-0021-agpl-commercial-delivery.md)：Accepted，记录用户 2026-10-26 选择的 AGPL 路线及 2026-10-27 确认的阶段 A 结案范围；法律签收与实际发布证据由 OD-010 单独验收。

- [ADR-0022：逐包许可证判定与补充正文证据](ADR-0022-exact-license-decisions.md)：Accepted（2026-11-01），Supply Chain Gate 的许可证结论按包/版本/integrity 精确判定，缺正文时以摘要绑定的补充证据补齐；不扩大全局白名单，不关闭 A-06/A-07。

- [ADR-0023：自有工业网关（OPC UA 优先），CONNECT 降为可选](ADR-0023-own-industrial-gateway.md)：Accepted（2026-11-01），用户在缺口整改第 2 步选择自研网关；浏览器协议不变，Historian 不再要求 CONNECT，Appliance 中 CONNECT 改为可选组件。

- [ADR-0024：HMI 四级角色、写操作审计与 Forgejo 服务端项目存储](ADR-0024-hmi-roles-and-server-projects.md)：Accepted（2026-11-01），落实 OD-001 的 Appliance 范围：访问服务为唯一身份源，Caddy forward_auth 强制 HMI 会话，网关按角色写入，项目存于 Forgejo；组织/多租户/云端仍待规格。
- [ADR-0025：告警管理与基于实时信号的可配置 KPI](ADR-0025-alarm-management-and-configured-kpis.md)：Accepted（2026-11-01），告警状态机（锁存、确认、限时搁置、浏览器内历史）建在 ErrorStore 之上，优先级与 KPI 定义存为项目文档 `hmi/*.json`，确认/搁置上报审计。
- [ADR-0026：自研 IK、刚体机构与 CSG 加工提供者](ADR-0026-builtin-ik-mechanism-machining-providers.md)：Accepted（2026-11-03），公共构建以自研实现填充空的提供者槽位（许可提供者优先）；IK 在场景链上闭式求解并以 FK 复核，加工为 Worker 内 SDF + Marching Cubes，机构为关节坐标阻尼牛顿约束求解。
- [ADR-0027：入口 chunk 体积预算提高到 3,600,000 字符](ADR-0027-entry-budget-raise-2026-11.md)：Accepted（2026-11-03），用户决定提高入口预算（实测 3,519,856，余量仅 144）；诊断合计守卫改为预算 + 25,000，T14 固定新值，预算继续作为棘轮；修订 ADR-0001 R1 的数值，不改其规则。
- [ADR-0029：容器模式工业网关经专用 ot 网络到达 PLC，出口由客户宿主 ACL 约束](ADR-0029-container-gateway-ot-network.md)：Accepted（2026-11-04），用户对 OD-012 选择方案 (a)；只有网关另接非 internal 的 `ot` 网络（宿主网桥 `xyv-ot`），其余服务不变，出口由客户 ACL 限制到 PLC 端点。
- [ADR-0028：多人会话角色由登录会话决定，并由网关守卫强制](ADR-0028-multiuser-role-from-session.md)：Accepted（2026-11-03），用户在第二轮整改第 4 步选择“浏览器上限 + 网关守卫”；有账户的部署中角色以会话为上限，Appliance 网关 `/gateway/multiuser` 覆盖 `room_join` 角色、拦截 viewer 的写类消息并审计。
