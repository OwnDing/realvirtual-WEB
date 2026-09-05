---
doc_id: CONTRACT-VERSION-COMPAT-001
title: 版本支持、兼容与升级恢复契约
status: approved
owner: architecture
last_reviewed: 2026-09-01
authority: normative
---

# 版本支持、兼容与升级恢复契约

## 1. 可写入合同的兼容性声明

> XYvirtual WEB 标准维护覆盖当前 GA 次版本及此前两个次版本（N-2），每条次版本线以其最新补丁为受支持基线。自 6.3.16 起，发行包通过机器可读清单声明可直接升级的来源版本、必要桥接版本和持久数据格式读取范围。供应方保证声明范围内的项目在升级前自动备份、迁移失败可恢复，并保留已支持 schema 内的未知字段。超出清单范围、跨主版本、直接降级或客户自行修改的存储格式不属于直接兼容承诺，安装器将拒绝并给出桥接或专项迁移要求。LTS 仅在订单明确指定版本线与期限时成立，默认 24 个月。

“可恢复”表示恢复到升级前已校验备份，不表示所有数据变化都能只靠切换程序指针反向迁移。支持方可用升级到后续受支持版本的方式解决缺陷，不承诺对每个旧补丁分别回移修复。

## 2. 版本与窗口

- release 使用 SemVer `major.minor.patch`；预发布版本低于相同 core 的 GA。
- N-2 按 minor release line 计算，且只在同一 major 内成立。
- `effectiveBaseline=6.3.16`；早于基线的来源按 `bridges[]` 处理。
- 候选清单缺少 `compatibility` 时不得作为升级目标；为了接收存量安装，来源 release 的旧清单可以缺少该字段。

稳定版本判定码：`FRESH_INSTALL`、`REPEAT_INSTALL`、`DIRECT_UPGRADE_SUPPORTED`、`UPGRADE_BRIDGE_REQUIRED`、`SOURCE_OUTSIDE_N_MINUS_2`、`SOURCE_VERSION_UNSUPPORTED`、`DOWNGRADE_REQUIRES_ROLLBACK_OR_RESTORE`、`COMPATIBILITY_DECLARATION_MISSING`。数据格式判定码：`FRESH_INSTALL_DATA_FORMATS`、`LEGACY_SOURCE_FORMATS_ACCEPTED`、`PERSISTED_FORMATS_SUPPORTED`、`PERSISTED_FORMAT_UNSUPPORTED`；最后一项必须在备份或候选写入前失败关闭。

## 3. Appliance manifest 扩展

`appliance-manifest.json` schema 1 加法包含：

```json
{
  "compatibility": {
    "schemaVersion": 1,
    "policy": "N-2",
    "effectiveBaseline": "6.3.16",
    "directUpgrade": {
      "sameMajorOnly": true,
      "maximumMinorDistance": 2,
      "minimumSourceVersion": "6.3.16"
    },
    "bridges": [{ "sourceBefore": "6.3.16", "via": "6.3.16" }],
    "dataFormats": {
      "projectManifest": { "minReadable": 1, "maxReadable": 2, "current": 2 },
      "browserUpgradeBackup": { "minReadable": 1, "maxReadable": 1, "current": 1 }
    }
  }
}
```

构建器从受版本控制的 `appliance/release-compatibility.json` 读取，不允许安装现场修改。格式 `current` 超出旧 release 的读取范围时，程序指针 rollback 必须拒绝。

## 4. 备份与恢复

### Appliance

每次 `existing.version != candidate.version`，标准 upgrade 在启动候选前调用完整 `backup`：配置、PKI、许可证、Secret、Git、InfluxDB、CONNECT 和 install state 全部复制，生成按路径排序的 SHA-256 清单，并立即重新枚举、逐文件回读校验后才返回 backup 路径。候选失败后，若已取得 safety backup，则恢复它再启动旧版。

### 浏览器 origin

`xyvirtual-browser-upgrade-backup` schema 1 保存于 `rv-upgrade-backups/backups` IndexedDB。记录必须包含 `id`、稳定 `migrationId`、来源/目标、origin、时间、有序 `{key,value}` 和摘要。自动迁移必须在写入后回读并验证；失败时写 `rv-upgrade/blocked` 诊断并跳过迁移。

恢复遵循：校验目标备份；即使当前迁移范围为空也先创建 pre-restore 备份；先写回备份项；全部成功后只删除注册命名空间内多出的键；不得清除无关 localStorage、其他 browser project 或只读的 scene-owner 数据。工作区迁移只拥有固定 `workspace-default` 的 manifest/blob index，不拥有整个 `rv-project/browser/` 前缀。恢复备份可以下载为 JSON，篡改记录不得改变当前状态。

## 5. 项目和迁移

project manifest 当前经验证并承诺的范围为 `minReadable=1,maxReadable=2,current=2`。schema 1 通过现有迁移转换到 schema 2。现有 schema 数字是加法 revision：更高 revision 只要满足本版本已知必需形状，仍可尽力读取并保留未知字段，但不属于 `maxReadable` 的合同保证范围；未来破坏性格式必须使用新的 format/generation 标识。新增 migration 必须注册稳定 ID、domain、`boot|read|manual`、备份类型和 rollback 类型。

## 6. 客户责任与排除

客户应在生产升级前于等价环境演练、保证备份容量、保存下载的浏览器备份并在维护窗口停止业务写入。改变 HTTPS scheme/host/port 会形成新 origin，须作为独立迁移。手工编辑数据库、绕过预检、删改备份或在支持窗口外直接跳转不在标准恢复承诺内。
