---
doc_id: EP-HMI-001
title: 缺口整改第 4 步：告警管理（锁存、确认、搁置、历史）与 KPI 配置化
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-01
authority: normative-process
---

# EP-HMI-001：缺口整改第 4 步：告警管理（锁存、确认、搁置、历史）与 KPI 配置化

## Purpose

完成后，操作员面对的是需要处理的告警：每条告警有优先级，未确认时闪烁，短暂故障回落后仍保留到有人确认；工程师可以限时搁置干扰告警，到期自动复现；所有触发、回落、确认、搁置都有可导出的历史，确认与搁置还记入 Appliance 审计。项目可以定义自己的 KPI（当前值、产量速率、比例、开机率、OEE），数值来自实时信号而不是演示数据。

## Scope

- `AlarmStore` 状态机、配置解析、浏览器内有界历史与 CSV 导出；每个 viewer 一个实例，由 `ErrorStore` 驱动。
- 告警面板（替换原 WebError 面板实现）：优先级颜色与排序、确认/全部确认（operator）、搁置/解除搁置（engineer）、历史对话框；保留“问 AI”诊断入口。
- 访问服务 `/audit-events` 新增 `alarm.ack`（operator）、`alarm.shelve`/`alarm.unshelve`（engineer）；浏览器能力 `ack-alarms`、`shelve-alarms`、`configure-hmi`。
- `KpiEngine`、KPI 栏卡片（仅当项目定义 KPI 时注册）、“告警与 KPI”设置页签（engineer 可编辑）。
- 项目文档 `hmi/alarms.json`、`hmi/kpis.json` 的读写（项目可写时写项目，否则写本浏览器）。

## Non-goals

- 告警的集中存储（Appliance SQLite / InfluxDB）与跨终端历史。
- 告警抑制组、首出告警、告警泛滥分析等 ISA-18.2 高级功能。
- 网关侧 KPI 计算；改变演示 KPI 插件。
- 改变 GLB / `rv_extras` 中 WebError 组件格式。

## Required Documents and Decisions

[ADR-0025](../../adr/ADR-0025-alarm-management-and-configured-kpis.md)、[CONTRACT-HMI-001](../../contracts/HMI_PROJECT_CONFIG.md)、[ADR-0024](../../adr/ADR-0024-hmi-roles-and-server-projects.md) 与 [CONTRACT-ACCESS-002](../../contracts/HMI_ACCESS.md)（能力与上报事件）、ADR-0001（i18n 延迟目录）、入口体积预算（`tests/bundle-splitting.test.ts`）。

## Current Repository Facts

- 起点：`develop` = `1b4f0b0`（第 3 步 PR #23 已合并）；分支 `claude/remed-step4-alarms`。
- `ErrorStore` 只在信号为高期间保存条目；`web-error-plugin.tsx` 直接渲染这些条目。
- KPI 栏只有演示插件的种子伪随机数据。
- 第 3 步提交时入口 chunk 为 3,517,991 字节，预算 3,520,000 且测试禁止放宽。

## State Ownership and Compatibility

| 状态 | 位置 |
| --- | --- |
| 告警配置、KPI 定义 | 项目文档 `hmi/alarms.json`、`hmi/kpis.json`（无可写项目时为本浏览器 `rv-hmi-config/…`） |
| 告警历史 | 本浏览器 `localStorage` 键 `rv-alarm-history/<项目或模型>`，最近 1000 条 |
| 确认/搁置审计 | Appliance 访问库审计表（`outcome = reported`） |
| KPI 窗口 | 内存，刷新后重新积累 |

不定义上述文档的项目：告警按缺省（`high`、锁存）管理，KPI 栏不新增条目。

## Allowed Paths

`src/core/hmi/**`、`src/plugins/web-error-plugin.tsx`、`src/plugins/web-error/**`、`src/plugins/hmi-operations-plugin.tsx`、`src/plugins/hmi-operations/**`、`src/core/i18n/catalogs/**`、`src/main.ts`（一行插件注册）、`appliance/runtime/access/http.mjs`、相关 `tests/**`、`docs/**`。

## Forbidden Paths

`ErrorStore` 语义、GLB/`rv_extras` 格式、演示 KPI 插件、网关与 Realtime v2 协议、入口体积预算。

## Milestones

1. 状态机与 KPI 计算（纯逻辑，Node 测试）。
2. 角色能力、上报事件与服务端复核。
3. 告警面板、历史对话框、KPI 栏与设置页签；配置读写。
4. 入口体积：引擎与界面拆为独立 chunk，英文文案进入延迟目录。

## Progress

- [x] M1–M4 实现与测试（见 Validation）。
- [ ] 远程 CI 与合并。

## Surprises & Discoveries

- 首版把告警面板与引擎静态打进入口，入口增至 3,532,539 字节（超预算 12.5 KB）。将引擎、面板、历史对话框、KPI 运行时与编辑器拆成独立 chunk，并把英文文案放入延迟 en-US 目录的 `operator.alarms`（独立模块，避免 Rollup 把英文拉回入口）后为 3,519,114 字节。zh-CN 文案按 ADR-0001 必须留在入口，因此精简了几条较长的中文句子。
- KPI 栏只要存在任何 `kpi-bar` 条目就会渲染容器；为了不改变未使用 KPI 的部署，KPI 条目在项目定义了 KPI 时才通过 `uiRegistry.register()`（按插件 ID 幂等）动态加入，删除全部 KPI 后移除。
- 告警确认不写 PLC，因此上报审计是补充证据而非权限边界；真正的写入仍由网关按角色审计（ADR-0024）。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-01 | 第 4 步范围为告警锁存/确认/历史/搁置与 KPI 配置化 | 用户确认的缺口整改计划（“用户当前明确指令”） |
| 2026-11-01 | 优先级/锁存与 KPI 定义存为项目文档，不入 GLB、不入统一配置 | ADR-0025 |
| 2026-11-01 | 告警历史留在浏览器，确认/搁置另上报审计 | ADR-0025，避免本步新增服务端存储 |

## Validation

本地（macOS arm64，2026-11-01，提交前）：

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（离线帮助因“界面与视角”新增“告警与 KPI”一节重新生成） |
| `./scripts/verify.sh static` | 通过；首轮 i18n 清单发现懒加载边界标签 `"Alarms"` 为硬编码文案，改为目录文案后基线不变 |
| `./scripts/verify.sh node` | 90 文件 / 915 条通过（`appliance-lifecycle` 以临时占位 Linux 命令运行）；网关 21 条通过。新增：`alarm-store`（9：确认后回落、锁存/非锁存、按优先级排序、限时搁置到期复现、全部确认与文本变化不算新发生、历史有界与按范围隔离及换模型重置、CSV 防公式注入、不可信配置解析）、`kpi-engine`（5：阈值、计数器复位、开机率与 OEE、窗口裁剪与缺失信号、配置解析）、`hmi-access` 新增 operator 可上报 `alarm.ack`、不可上报 `alarm.shelve` |
| `./scripts/verify.sh build` | 通过；入口 chunk 3,519,135 字节（预算 3,520,000，未放宽） |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过；新增 `hmi-alarms-kpi`（5：viewer 无操作入口、operator 确认锁存告警并上报、engineer 搁置/解除并上报、历史对话框与 CSV、KPI 栏条目随定义注册/移除、配置保存位置），`hmi-session` 能力矩阵扩展，`web-error-ask-ai` 改为等待懒加载面板 |
| `./scripts/verify.sh supply-chain`（Node 22.22.2） | `web`、`gateway` 两个作用域均通过（本步无依赖变化） |

未验证（需远程 CI 或实机）：Appliance 实机上的确认/搁置审计记录；真实 PLC 信号驱动的 KPI；长时间运行下的 OEE 准确性。

## Rollback

回退本步提交即恢复原 WebError 面板；项目中的 `hmi/*.json` 文档被旧版本忽略，访问库无格式变化。

## Outcomes & Retrospective

（远程 CI 与合并后补齐。）
