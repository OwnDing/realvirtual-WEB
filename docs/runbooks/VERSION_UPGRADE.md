---
doc_id: RUNBOOK-VERSION-UPGRADE-001
title: 私有化版本升级与恢复运行手册
status: approved
owner: engineering
last_reviewed: 2026-09-01
authority: normative-process
---

# 私有化版本升级与恢复运行手册

## 升级前

1. 确认当前版本、目标 bundle、target、运行模式和稳定 HTTPS origin；不得在同一次升级修改 scheme/host/port。
2. 在隔离验收环境复制生产配置与脱敏数据演练。确认目标在 N-2 或清单给出的桥接路径内。
3. 检查 `stateRoot/backups` 容量与客户备份保留策略；通知浏览器用户保存工作并保持原浏览器 profile。
4. 解包到新目录并执行 `preflight --config <外部配置>`。只有 `READY` 且 `upgrade-compatibility`、`upgrade-data-formats` 均为 pass 才继续；`PERSISTED_FORMAT_UNSUPPORTED` 必须转专项迁移，不能靠改清单绕过。

## 标准升级

执行 `upgrade` wrapper。安装器会验证 bundle，创建完整一致性备份，分阶段部署候选，等待 control plane 与 HTTPS readiness，通过后提交指针。记录输出的目标版本和 backup 路径。用户首次打开时，需迁移的浏览器 profile 会先自动建立并校验本地升级备份；备份失败时迁移被阻断，保留旧数据等待排障。

验收至少包括：版本/status、项目列表与一个 6.3.16 fixture、场景保存重开、CONNECT、Git、历史查询、证书、浏览器 Settings → Backup 中的升级备份、零外呼。

## 失败处理

- `UPGRADE_BRIDGE_REQUIRED`：停止；取得并安装报告指定的 bridge，再重新预检目标。不要改 manifest 绕过。
- `DOWNGRADE_REQUIRES_ROLLBACK_OR_RESTORE`：停止；选择 lifecycle rollback 或已校验备份 restore。
- 候选 readiness 失败：不要重复启动候选。安装器会恢复 safety backup 并重启旧版；核对 status、backup manifest 和核心数据后收集脱敏诊断。
- 浏览器显示迁移阻断：检查 origin 配额/IndexedDB/隐私模式；不要清 localStorage。恢复存储能力后重载，系统会重新备份并迁移。

## 回退选择

`rollback` 只适用于数据服务和持久格式均可由旧 release 读取的情况。命令拒绝时，使用升级前 backup 执行 `restore --confirm-restore <installId>`。浏览器端在 Settings → Backup 先下载备份，再选择 Restore；系统会先建立 pre-restore 安全点并重载。

任何真实生产升级、回退和 restore 都应记录来源/目标、manifest 摘要、backup 路径、操作者、时间、结果和未验证项；记录不得含 Secret。
