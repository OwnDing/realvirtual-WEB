---
doc_id: CONTRACT-UNIFIED-CONFIG-001
title: Unified Configuration v1 契约
status: approved
owner: architecture
last_reviewed: 2026-08-29
authority: normative
---

# Unified Configuration v1 契约

机器可读 Schema：Deployment Config v2 为 [`../../schema/v2/deployment-config.json`](../../schema/v2/deployment-config.json)，项目配置为 [`../../schema/v1/project-config.json`](../../schema/v1/project-config.json)。

## 1. 字段目录

首版稳定字段：

| Path | 类型 | 可写层 | 合并/策略 |
| --- | --- | --- | --- |
| `locale` | `zh-CN \| en-US` | deployment/project/user/session | 最高普通层；`lockedPaths` 可锁 |
| `workspace.default` | 稳定 workspace ID | deployment/project/user/session | 最高普通层，必须属于有效 allowed 集合 |
| `workspace.allowed` | workspace ID[] | deployment/project | shipped capability、各层声明与 policy 上限求交集 |
| `features.<id>` | boolean | deployment/project/user/session | 最高普通层；capability 缺失或 policy deny 永远为 false |

稳定内置 workspace IDs 为 `viewer`、`hmi`、`des`、`planner`、`commissioning`、`editor`。功能 ID 与插件公共稳定 ID 同名；未知 ID 可以保留并解释，但不能使未交付代码变为可用。

## 2. Deployment Config v2

v2 保留 v1 的 `identity`、`legal`、`egress`、`services`、`license`，增加：

```json
{
  "schemaVersion": 2,
  "defaults": {
    "locale": "zh-CN",
    "workspace": { "default": "hmi", "allowed": ["viewer", "hmi"] },
    "features": { "mcp-bridge": false }
  },
  "policy": {
    "lockedPaths": ["locale"],
    "workspace": { "allowed": ["viewer", "hmi"] },
    "features": { "mcp-bridge": "deny" }
  }
}
```

`lockedPaths` 只接受 `locale`、`workspace.default`、`workspace.allowed` 和 `features.<valid-id>`。`policy.features` 当前只接受 `allow`/`deny`；`deny` 优先。部署 v1 和缺少版本的旧配置迁移为 v2 语义但不改写源文件；迁移保留普通扩展字段，但删除在 v1 中本来无效的 `defaults`/`policy`，避免升级版本号意外激活策略。未知未来版本的部署字段被忽略，egress 回到 deny。

## 3. Project Config v1

```json
{
  "$schema": "rv-project-config/1.0",
  "defaults": { "locale": "en-US", "workspace": { "default": "planner" } },
  "modelProfiles": {
    "doc_stable_id": { "defaults": { "features": { "measurements": false } } }
  }
}
```

`modelProfiles` 的 key 必须是项目中稳定 document/model ID。profile 与项目 defaults 同属 project 层，profile 更具体；其中出现安全字段、policy 或未知结构时忽略并诊断。

## 4. User 与 Session

用户记录 key 为 `rv-config/user/v1/global` 与 `rv-config/user/v1/scope/<encoded-scope>`，形状为 `{ "v": 1, "preferences": <ordinary-values> }`。写入失败时保持内存状态，不影响启动。

会话 allowlist 为 `lang`/`locale`、`mode` 和 `feature.<id>`；布尔只接受 `1/0/true/false/on/off`。会话值不写存储。`lockSettings=false`、安全字段、服务 URL 与 egress 参数不属于 allowlist。

## 5. 解析结果

解析器必须返回：`effective`、`provenance[path]` 与 `rejected[]`。同输入必须得到同输出；不得读时修复或写回。数组输出去重且排序稳定，输入对象不得被修改。

## 6. Legacy bundle

用户显式导入 `rv-settings-bundle/1.0` 保持原行为。项目 `settingsRef` 或模型 `.settings.json` 自动加载同一格式时，只提供项目/model 内存 overlay；不得调用用户保存函数或改变 localStorage。切换 owner 时 overlay 必须清除。
