---
doc_id: ADR-0010
title: 版本化升级、兼容窗口与恢复边界
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-09-01
authority: normative
---

# ADR-0010：版本化升级、兼容窗口与恢复边界

## Context

仓库已有项目、文档、引用、浏览器工作区和工作文件夹迁移，但它们由不同入口触发，没有统一发行兼容声明。Appliance 能在候选 readiness 失败时恢复，却不拒绝降级或越窗来源，并且只在数据服务版本变化时做全量备份。`project.json.bak` 只处理单文件撕裂；服务器也无法备份浏览器 origin 内的 OPFS、IndexedDB 和 localStorage。

## Decision

1. 发布包的不可变 manifest 持有 `compatibility` 声明：N-2、有效基线、直接升级约束、桥接 release 和每个持久格式的 `minReadable/maxReadable/current`。
2. 预检是唯一写前版本门。候选比当前版本低、跨 major、早于基线、超过窗口，或不能读取来源 release 当前持久格式时失败关闭；桥接只是明确下一步，安装器不会假装已经执行桥接。
3. 每个版本变化先做完整 Appliance 一致性备份，不再以“组件版本看起来没变”为省略依据。
4. 浏览器迁移由浏览器自身在同 origin 内备份其会改动的键；备份放入独立 IndexedDB，包含稳定 schema、来源/目标/迁移 ID、逐项内容和摘要，写后回读校验。恢复只删除迁移拥有的键，保留无关 origin 数据，并先保存恢复前状态。
5. 所有迁移进入稳定 ID 注册表，声明 domain、执行时机、备份和回退姿态；迁移 ID 不复用。
6. `project.json` 的既有 schema 数字仍按加法 revision 处理：只要已知必需形状有效，就接受更高 revision，并在 read-modify-write 中保留未知字段。`maxReadable` 是经 fixture 验证和合同承诺的上界，不撤销既有的尽力前向容忍；未来破坏性格式必须使用新的 format/generation 标识并另立 ADR，不能借提高现有 revision 破坏该契约。
7. 回滚 release 指针与恢复数据是两个操作。只有旧 release 能读取当前格式且共享数据服务未变化时允许前者，否则必须恢复一致性备份。

## Alternatives

- 仅写运维手册：无法让安装器在写盘前阻止错误路径，也无法阻止合同与代码漂移。
- 每次迁移各自增加备份：仍没有稳定清单和共同语义，支持无法判断某个 release 实际覆盖什么。
- 把现有 schema revision 改成严格代际门：会破坏仓库既有的加法前向兼容和客户 fixture，故不采用；破坏性代际必须使用新的格式标识。
- 所有浏览器数据由服务器备份：origin storage 不在服务器文件系统中，技术上不成立。

## Consequences

正面影响是升级资格、备份、恢复和支持窗口可由机器与合同共同审计；降级不再被误当升级。代价是每次版本变化增加停机和备份容量，浏览器备份占用 origin 配额；客户需要管理保留期。未来新增持久格式或迁移必须同步发行声明和注册表。

## Compatibility and Migration

现有 schema 1–2 项目继续读取，未知字段继续原样保留。`6.3.16` 作为首个可验证基线；更早版本通过 `6.3.16` 桥接。旧 Appliance manifest 可以作为已安装来源被读取，但不能作为缺少兼容声明的候选安装。现有浏览器迁移不改执行顺序，只在其前面增加阻断式备份。

## Validation

使用发布兼容纯函数测试、Appliance bundle/lifecycle 测试、6.3.16 project/browser fixtures、浏览器备份篡改与恢复测试、migration registry 唯一性测试和更高加法 revision 保留测试验证。

## Rollback or Supersession

代码可回退，但已产生的备份和兼容声明不得删除。替代本 ADR 必须提供同等机器可判定的支持窗口、浏览器数据恢复和跨版本 fixture，并通过新的 Accepted ADR。
