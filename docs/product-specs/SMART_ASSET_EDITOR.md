---
doc_id: PS-ASSET-001
title: 智能资产编辑器
status: approved
owner: product
last_reviewed: 2026-08-22
authority: normative
---

# 智能资产编辑器

## 目的

让用户在开源 Web 平台内把已有 GLB 或空白资产制作成可复用的智能设备：编辑资产层级与 `rv_extras`，快速创建稳定装配端口、行为配置和 PLC 信号，运行发布前诊断，然后保存到当前项目并立即在 Planner Library 中复用。

批准来源：用户于 2026-08-22 明确确认项目无许可问题，认可智能资产编辑器方向，并要求“做好 execplan，然后需要你完全实现智能资产编辑功能”。

## 用户闭环

1. 用户可从工作区进入 Editor，新建空白资产、打开当前项目资产，或通过统一导入加入一个或多个 GLB。
2. Editor 显示资产名称、层级、选择和通用属性检查器；所有编辑进入 `AssetDocument`，可撤销、重做并进入现有草稿恢复链路。
3. “端口”向导可在指定位置创建稳定 `AssemblyPort`，并双写兼容旧 Planner 的 `Snap-*` 节点名。
4. “智能模板”可为通用输送模块、涂装轨道段、工艺区、控制器或机器人写入已有运行时可消费的组件配置；参数可继续在 Inspector 中精调。
5. “信号”向导可创建六种现有 PLC 信号类型，明确平台视角的输入/输出方向，并防止同资产内重名。
6. 发布前校验应同时报告阻断错误和非阻断警告，覆盖稳定身份、端口、模板参数、信号和空资产；错误项必须可定位到节点。
7. 保存走当前项目的统一文档保存链路；成功后项目文档列表与 Library 立即刷新，用户可切换到 Planner 再次拖入。

## 智能模板（首版）

- 通用元数据：`RuntimeMetadata`；
- 通用输送：`TransportSurface`；
- 涂装轨道模块：`PaintLineTrackModule`，使用 `track.in` / `track.out` 稳定端口；
- 涂装工艺区：`PaintProcessZone`；
- 涂装控制器：`PaintLineController`；
- 涂装机器人：`PaintProcessRobot`。

模板是已有 `rv_extras` 组件与领域扩展的写入向导，不另造第二份资产 Schema，也不把运行时瞬态写回 GLB。

## 状态与兼容边界

- 几何、节点、`NodeId`、组件、端口、信号和资产行为参数属于 GLB/`rv_extras`；
- Planner 中的实例位置、装配结果和项目级覆盖仍属于项目文档；
- 新端口遵循 `CONTRACT-ASSEMBLY-PORTS-001`，双写 `AssemblyPort` 和旧 `Snap-*` 名称；
- 未识别字段原样保留，现有 GLB、rv-ODT 1.0/1.1、旧 Snap 和项目保存格式不迁移；
- MQTT、PLC、WebSocket、MCP 写权限和工业连接行为保持不变。

## Non-goals

- STEP/JT/USD 转换器、云资产管理器或 ThingsBoard Gateway；
- 新 PLC 协议、只读模式或 MQTT 行为改造；
- 复杂刚体机构、自动 CAD 语义识别、自动布线、AI 生成几何；
- 新的 DES 调度内核或真实设备写入；
- 资产市场、版本发布服务、多人协作与审批流。

## 验收

| 场景 | 预期 |
| --- | --- |
| 进入 Editor | 公开构建可见 Editor，运行时为 detached，出现智能资产工作区 |
| 新建并导入 GLB | 模型进入同一资产且形成可撤销操作；取消/坏文件不污染文档 |
| 创建装配端口 | 写入合法稳定 ID、类型、流向、方向和旧名称；重复 ID 被阻止或校验报错 |
| 应用智能模板 | 写入已有组件结构，默认值合法，可在 Inspector 中继续编辑 |
| 创建 PLC 信号 | 六种类型可选，方向解释清楚，重名被拒绝 |
| 发布前检查 | 错误阻止发布，警告可见；选择问题可定位节点 |
| 保存发布 | 使用统一保存/CAS；Library 刷新并能在 Planner 再次放置 |
| 旧资产与工业接口 | 未识别字段、旧 Snap、现有 MQTT/PLC 行为不变 |

自动化至少覆盖纯校验/模板单元测试、Editor 生命周期与保存刷新集成测试，以及一个浏览器黄金流程。真实 PLC、客户模型、GPU 性能和人工视觉若未验证必须披露。
