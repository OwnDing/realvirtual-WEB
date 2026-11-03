---
doc_id: ADR-0025
title: 告警管理（优先级、锁存、确认、搁置、历史）与基于实时信号的可配置 KPI
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# ADR-0025：告警管理（优先级、锁存、确认、搁置、历史）与基于实时信号的可配置 KPI

## Context

缺口评估（2026-11-01）发现两项 HMI 运营能力缺失：

- **告警**：`ErrorStore`（`src/core/engine/rv-error-store.ts`）只在 WebError 信号为高期间保存一条记录，`web-error-plugin.tsx` 把它们显示成红色卡片。信号一回落记录即消失；没有优先级、没有确认、没有锁存、没有搁置，也没有历史。操作员可能错过一次短暂的故障，事后也无法回答“什么时候、谁处理了”。
- **KPI**：顶部 KPI 栏只有演示插件 `demo-hmi-plugin.tsx` 的四张卡片，数值是种子伪随机序列，与工厂信号无关；项目无法定义自己的 KPI。

用户在缺口整改计划中确认第 4 步为“告警管理（锁存、确认、历史、搁置）和 KPI 配置化”，并要求每步测试通过后提交（“用户当前明确指令”，2026-11-01）。第 3 步（ADR-0024）已经提供了 HMI 角色与浏览器上报审计事件的通道。

## Decision

1. **告警在 ErrorStore 之上，而不是替代它。** `ErrorStore` 语义不变（信号级、为高期间存在）。新的 `AlarmStore`（`src/core/hmi/alarm-store.ts`）观察其变化，按 ISA-18.2 的简化状态机管理告警：

   | 状态 | 含义 | 离开方式 |
   | --- | --- | --- |
   | `active-unack` | 信号为高，未确认（卡片闪烁） | 确认 → `active-ack`；回落 → 锁存时 `rtn-unack`，否则移除 |
   | `active-ack` | 信号为高，已确认 | 回落 → 移除 |
   | `rtn-unack` | 已回落但未确认（锁存） | 确认 → 移除；再次触发 → `active-unack`（次数 +1） |
   | `shelved` | 工程师限时搁置（1–480 分钟） | 到期或解除 → 仍为高则 `active-unack`，否则移除 |

   告警 ID 即 ErrorStore 路径；文本变化不算新的发生次数。切换模型时实时告警结束，历史保留。

2. **优先级与锁存是项目数据。** 存于项目文档 `hmi/alarms.json`（格式见 [CONTRACT-HMI-001](../contracts/HMI_PROJECT_CONFIG.md)），不写入 GLB/`rv_extras`，也不进入统一配置（它们属于具体工厂，不属于部署）。缺省：优先级 `high`、锁存开启。优先级决定卡片颜色（critical/high 红、medium 琥珀、low 蓝）和排序。

3. **权限沿用 ADR-0024 的能力映射。** 确认：operator 及以上（`ack-alarms`）；搁置/解除搁置与修改告警、KPI 配置：engineer 及以上（`shelve-alarms`、`configure-hmi`）。未部署访问服务时保持原有行为（全部允许）。确认、搁置、解除搁置通过 `POST /api/access/v1/audit-events` 上报为 `alarm.ack`、`alarm.shelve`、`alarm.unshelve`，服务端按角色复核并以会话身份记账；这仍是补充证据，不是安全边界（告警处理不会写入 PLC）。

4. **历史在浏览器内、有界。** 每个项目（无项目时按模型 URL）一份最近 1000 条事件，保存在本浏览器 `localStorage`，可导出 CSV（防公式注入）。集中、长期的告警历史留待 Historian 侧另行决定；本 ADR 不把告警写入 InfluxDB。

5. **KPI 来自实时信号，由项目定义。** `hmi/kpis.json` 定义最多 32 个 KPI，类型 `value`（当前值）、`rate`（计数器 → 件/小时，容忍计数器复位）、`ratio`（分子/分母 %）、`uptime`（Bool 为真的时间占比）、`oee`（可用率 × 性能 × 质量，输入为运行信号、总数与良品计数器、理想节拍）。`KpiEngine`（`src/core/hmi/kpi-engine.ts`）每秒采样 `SignalStore`，在内存窗口（默认 60 分钟，1–1440）内计算，并给出阈值状态（警告/报警）。窗口在刷新后从零开始；长期趋势归 Historian。未定义 KPI 时 KPI 栏不出现任何新条目，演示 KPI 不受影响。

6. **配置保存位置。** 打开可写项目时保存到项目（文件夹项目写文件；服务端项目即一次带用户名的 Forgejo 提交，ADR-0024）；否则保存到本浏览器并明确告知。编辑入口为设置中的“告警与 KPI”页签。

7. **不增加入口体积。** 告警引擎、面板、历史对话框、KPI 引擎与编辑器均为独立 chunk；入口只保留插件外壳与 zh-CN 文案（英文文案进入延迟 en-US 目录的 `operator.alarms`）。入口预算 3,520,000 字节不放宽。

## Consequences

- 操作员看见的是“需要处理的告警”，而不只是“当前为高的信号”；短暂故障因锁存不会被错过。
- 搁置有上限，到期自动复现，避免告警被永久隐藏。
- 告警历史是逐浏览器的：换一台电脑看不到前一台的历史；审计中的确认/搁置记录是跨终端的证据。
- KPI 数值刷新后需要积累窗口；OEE 的性能项依赖正确的理想节拍配置。

## Alternatives Considered

- **把优先级写进 GLB 的 WebError 组件**：需要 Unity 侧导出变更且绑定模型版本，现场无法调整，否决。
- **告警历史写入 Appliance 的 SQLite 或 InfluxDB**：需要新的服务端接口与保留策略；先以浏览器历史 + 审计事件满足“谁、何时处理”，集中历史另立决定。
- **在网关侧计算 KPI**：需要网关新增配置与协议字段，且离线演示无网关；浏览器侧计算对所有部署形态一致。

## References

- [ADR-0024](ADR-0024-hmi-roles-and-server-projects.md)、[CONTRACT-ACCESS-002](../contracts/HMI_ACCESS.md)、[CONTRACT-HMI-001](../contracts/HMI_PROJECT_CONFIG.md)
- [EP-HMI-001](../exec-plans/active/EP-HMI-001-alarm-management-and-kpis.md)
- ANSI/ISA-18.2 告警管理（状态机为其简化子集）
