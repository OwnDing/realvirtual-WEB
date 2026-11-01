---
doc_id: CONTRACT-HMI-001
title: 项目内 HMI 配置文档（告警与 KPI）格式契约
status: approved
owner: architecture
last_reviewed: 2026-11-01
authority: normative
---

# 项目内 HMI 配置文档（告警与 KPI）格式契约

依据 [ADR-0025](../adr/ADR-0025-alarm-management-and-configured-kpis.md)。实现：`src/core/hmi/alarm-store.ts`（`parseAlarmConfig`）、`src/core/hmi/kpi-engine.ts`（`parseKpiConfig`）、`src/core/hmi/hmi-project-config.ts`（读写位置）。

## 1. 位置与读写

- 两个文档是项目中的普通 JSON 文件：`hmi/alarms.json`、`hmi/kpis.json`，随项目备份、导出与 Forgejo 提交。
- 读取：先读当前项目后端中的文件；不存在或无法解析时读本浏览器 `localStorage` 键 `rv-hmi-config/<projectId|no-project>/<路径>`；都没有则使用缺省值。
- 保存：当前项目后端可写且项目处于可写状态时写入项目并 `flush`；否则写入上述浏览器键，并向用户说明保存位置。
- 两个文档都是**不可信输入**：解析器丢弃不合法的条目而不抛错；KPI 编辑器在保存前拒绝不完整条目并列出原因。

## 2. `hmi/alarms.json`

```json
{
  "schemaVersion": 1,
  "defaultPriority": "high",
  "latch": true,
  "alarms": {
    "Line/Conveyor/Motor": { "priority": "critical" },
    "Line/Door": { "priority": "low", "latch": false }
  }
}
```

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 必须为 `1`，否则整个文档按缺省处理 |
| `defaultPriority` | `critical` \| `high` \| `medium` \| `low`；缺省 `high` |
| `latch` | 布尔；缺省 `true`（回落后仍需确认） |
| `alarms` | 以 ErrorStore 路径（1–512 字符）为键，最多读取 5000 项；每项可选 `priority`、`latch`，非法值忽略，无有效字段的项丢弃 |

## 3. `hmi/kpis.json`

```json
{
  "schemaVersion": 1,
  "kpis": [
    { "id": "oee", "label": "OEE", "kind": "oee", "running": "Line.Running", "totalCount": "Line.Total",
      "goodCount": "Line.Good", "idealCycleSeconds": 12, "windowMinutes": 60, "warnBelow": 75, "alarmBelow": 60 },
    { "id": "rate", "label": "产量", "kind": "rate", "signal": "Line.Total" }
  ]
}
```

| 字段 | 规则 |
| --- | --- |
| `kpis` | 最多 32 项；超出部分忽略 |
| `id` | `^[a-z0-9][a-z0-9_-]{0,63}$`（不区分大小写），文档内唯一 |
| `label` | 1–80 字符 |
| `kind` | `value`（需 `signal`）、`rate`（需计数器 `signal`）、`ratio`（需 `numerator`、`denominator`）、`uptime`（需 Bool `signal`）、`oee`（需 `running`、`totalCount`、`goodCount`、`idealCycleSeconds` > 0） |
| 信号名 | 1–256 字符，按 `SignalStore` 名称读取；Bool 视为 0/1；模型中不存在的信号在卡片上列出 |
| `unit` | 可选；缺省 `rate` 为 `/h`，`ratio`/`uptime`/`oee` 为 `%` |
| `decimals` | 可选整数 0–6；缺省 `value` 2 位，其余 1 位 |
| `windowMinutes` | 可选 1–1440；缺省 60（`rate`、`uptime`、`oee` 使用） |
| `warnBelow` / `alarmBelow` / `warnAbove` / `alarmAbove` | 可选数值阈值；报警优先于警告 |

计算语义：每秒采样一次；`rate`、`uptime`、`oee` 至少积累 10 秒才给出数值。计数器下降视为复位，复位后的值计入增量。`oee` = 运行时间/窗口 × min(1, 总数 × 理想节拍 / 运行时间) × min(1, 良品/总数)；尚无产量时不给出数值。

## 4. 兼容性

- 新增字段必须可被旧解析器安全忽略；改变既有字段语义须提升 `schemaVersion` 并在此登记。
- 未定义 `hmi/kpis.json` 的项目不显示任何配置 KPI；未定义 `hmi/alarms.json` 的项目使用缺省（`high`、锁存）。
