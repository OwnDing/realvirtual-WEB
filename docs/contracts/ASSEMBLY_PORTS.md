---
doc_id: CONTRACT-ASSEMBLY-PORTS-001
title: 稳定装配端口契约
status: approved
owner: architecture
last_reviewed: 2026-08-22
authority: normative
---

# 稳定装配端口契约

本契约落实 [`ADR-0003`](../adr/ADR-0003-stable-assembly-ports.md)，规范字段以 [`schema/v1/rv-odt.json`](../../schema/v1/rv-odt.json) 与 [`schema/v1/specification.md`](../../schema/v1/specification.md) 为准。

## 身份与作用域

- `NodeId`：端口节点的 rv-ODT 节点身份。
- `AssemblyPort.PortId`：同一库资产内部稳定且唯一的装配语义 ID，例如 `track.in`、`track.out`、`robot.mount`。
- Three.js UUID：当前加载实例的运行时 ID，不得保存为跨会话引用。

库资产重新导出、节点改显示名或被放入不同场景时，`PortId` 不得改变。复制同一资产创建多个布局实例是合法的；完整寻址由布局实例 ID 与资产内 `PortId` 组成。

## 元数据

```json
{
  "extras": {
    "realvirtual": {
      "NodeId": "urn:rv:paintline:straight-2m:port:in",
      "AssemblyPort": {
        "PortId": "track.in",
        "TypeId": "paintline-track-v1",
        "Flow": "in",
        "Direction": { "x": 0, "y": 0, "z": -1 }
      }
    }
  }
}
```

`Direction` 是端口节点局部坐标中的向外方向。写入方应归一化；读取方必须拒绝零向量和非有限数，合法非单位向量可归一化后使用。

## 兼容规则

两个端口只有在 `TypeId` 完全相等且流向兼容时才能连接：`out↔in`、`bidi↔in`、`bidi↔out`、`bidi↔bidi` 合法；`in↔in` 和 `out↔out` 非法。

迁移期新资产同时使用旧式 `Snap-*` 节点名。运行时读取合法 `AssemblyPort` 后不得再用名称覆盖其字段；元数据缺失时才回退到名称解析。重复 `PortId` 或非法元数据必须产生可定位诊断，不得静默选择其中一个。

## 持久化边界

本版本保存设备布局与稳定端口元数据，不新增显式连接边表。重载时根据设备位姿、兼容端口和吸附容差重建连接。连接边成为业务事实前，必须另行定义项目 Schema、冲突与迁移语义。
