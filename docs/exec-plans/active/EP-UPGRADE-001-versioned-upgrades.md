---
doc_id: EP-UPGRADE-001
title: 版本支持与可恢复升级闭环
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-09-01
authority: normative-process
---

# EP-UPGRADE-001：版本支持与可恢复升级闭环

## Purpose

让 6.3 基线到后续版本的升级具备机器可判定支持窗口、写前全量备份、失败恢复、浏览器迁移恢复和可写入合同的边界。

## Scope

版本清单/预检、Appliance lifecycle、project schema 兼容姿态、浏览器 origin 备份恢复、迁移注册表、6.3.16 fixtures、设置页、产品/ADR/合同/runbook/验收证据。

## Non-goals

不发布 6.4 二进制；不自动改变 origin；不为早于 6.3.16 的版本伪造未经验证的直接迁移；不删除备份或旧数据。

## Required Documents and Decisions

`GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、Approved `PS-UPGRADE-001`、Accepted `ADR-0010`、`CONTRACT-VERSION-COMPAT-001`、`PS-APPLIANCE-001`、`ADR-0009`、`CONTRACT-APPLIANCE-BUNDLE-001`。

## Current Repository Facts

开始于 clean `develop` 的 `b800f06`，分支 `codex/version-upgrade-migration`。已有六类迁移、一方向 workspace conversion、单文件 `.bak` 和 Appliance 候选恢复；缺少来源版本门、统一声明、每次升级全备份和浏览器可恢复备份。目标迁移测试基线为 5 文件/96 例，Appliance lifecycle 为 3 例。

## State Ownership and Compatibility

发行兼容性由 bundle manifest 拥有；服务器备份在 `stateRoot/backups`；浏览器备份在独立 IndexedDB `rv-upgrade-backups`；migration catalog 为代码内稳定注册表。schema 1–2 是 fixture 验证和合同承诺范围；既有更高加法 revision 继续按已知形状读取并保留未知字段，破坏性 generation 必须使用新格式标识。

## Allowed Paths

- `appliance/`、`scripts/build-offline-appliance.mjs`
- `src/core/project/`、`src/core/upgrade/`、Settings/i18n
- `tests/fixtures/upgrade/`、范围内测试
- `docs/` 范围内规范、索引和证据

## Forbidden Paths

- 生产部署、真实 PLC/CONNECT 写接口、Secret、发布上传
- 既有持久字段/ID 的破坏性重命名或删除

## Milestones

1. 冻结 N-2、基线、LTS、rollback/restore 定义与合同条款。
2. 发行清单和预检拒绝错误路径，每次版本变化完整备份。
3. 浏览器迁移前验证备份、设置页下载/恢复、恢复前安全点。
4. schema 兼容姿态、迁移注册表、跨版本 fixtures 和正反例。
5. 全门禁、PR、GitHub Actions 全绿并记录证据。

## Progress

- [x] 产品规格、ADR、合同和 runbook
- [x] Appliance compatibility manifest、preflight 与全量备份
- [x] 浏览器备份/恢复与 UI
- [x] 项目 schema 兼容姿态和 migration registry
- [x] 6.3.16 fixtures 与聚焦测试
- [x] 全量治理/static/node/browser/build 本地门禁
- [ ] PR 和远程五项 Gate 全绿

## Surprises & Discoveries

- 旧 Appliance manifest 必须仍可作为来源验证；兼容声明因此对候选是必需、对来源是兼容可选。
- 服务器无法访问浏览器 origin storage；浏览器备份必须由同 origin 应用创建。
- 仓库既有项目 fixture 使用 schema 3 验证加法前向兼容；因此 `maxReadable=2` 是经验证的合同承诺上界，不得改成破坏现有高 revision 尽力读取的运行时硬门。
- 本机全量 Browser 首次发现 schema 前向兼容冲突和场景索引键双重所有权，均按既有契约修复；一次无关 avatar 16 ms 微基准抖动，单测与整个分片复跑通过，未放宽门槛。

## Decision Log

- 2026-08-31：用户明确同意 N-2、自动备份、失败恢复和合同兼容声明并要求完全实现、提交、开 PR、直到 Actions 全绿；据此批准 PS/ADR/本计划。
- 2026-08-31：以 6.3.16 为制度有效基线，早期版本只走显式 bridge，避免承诺未验证的 6.1/6.2 直接升级。
- 2026-08-31：每次版本变化全量备份，而非只在第三方数据服务版本字符串变化时备份。

## Validation

2026-09-01 本地：governance 79 份受治理文档通过；static（治理、发布链接、外部来源、ESLint、TypeScript）通过；Node 71 文件/730 例通过，2 文件/7 例按既有条件跳过；Browser 八分片共 10,917 例通过，隔离性能 11/11，最后恢复范围收窄对应 migration/backup/ownership 50/50 复跑；production build 14,943 modules 通过。最终证据仍需 GitHub 五项 required Gate。

## Rollback

代码回滚保留新增兼容字段和备份。Appliance 数据使用升级前 safety backup；浏览器使用已校验 upgrade backup。不得删除已生成备份来完成回滚。

## Outcomes & Retrospective

本地已形成版本路径门、来源/候选数据格式门、每版本立即回读校验的全备份、候选失败自动恢复、浏览器迁移写前备份与同 origin 恢复、加法 project revision 兼容和合同/runbook 的闭环。尚待 PR 与远程 Actions 后关闭计划；真实 Linux/Windows Appliance、真实 CONNECT/Forgejo/InfluxDB、客户浏览器/模型和生产恢复演练未在本机执行。
