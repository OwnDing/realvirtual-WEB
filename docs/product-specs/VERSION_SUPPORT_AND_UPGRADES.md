---
doc_id: PS-UPGRADE-001
title: 版本支持与可恢复升级
status: approved
owner: product
last_reviewed: 2026-09-01
authority: normative
---

# 版本支持与可恢复升级

## 1. 目标

私有化客户能够在断网环境中判断一个升级路径是否受支持，在任何持久数据迁移前得到已校验备份，并在候选版本或迁移失败后恢复到升级前的一致状态。销售、交付、支持和安装器对“兼容”“回滚”“恢复”使用相同定义。

本规格由用户 2026-08-31 对 N-2、升级前自动备份、迁移失败回滚和合同兼容性声明的明确同意批准。策略从可验证基线 `6.3.16` 起生效，不追溯承诺无法取得发布物验证的更早版本。

## 2. 支持窗口

- 标准维护覆盖当前 GA minor 版本线及前两个 minor 版本线，即 N-2；每条版本线只支持最新 patch。
- N-2 是直接升级和标准维护的共同上限，但“仍在维护”不等于任意两个版本都可直接跳转。每个发布包必须声明最早直接来源、最大 minor 跨度和需要的桥接版本。
- `6.3.16` 是本制度的有效基线。早于该版本的安装必须先经过发布清单指明的桥接版本；没有可验证桥接路径时拒绝升级并由支持团队制定专项迁移。
- LTS 不是默认承诺。只有订单或维护附件明确指定 release line 和期限时成立，默认期限为该 LTS 首次 GA 后 24 个月。
- 支持窗口外版本不接收功能回移；安全或严重缺陷的处理可以要求先升级到受支持版本，而不承诺为每个旧版本制作独立补丁。

## 3. 用户可观察流程

1. 运维先运行只读 `preflight`。报告显示来源、目标、`DIRECT_UPGRADE_SUPPORTED`、`UPGRADE_BRIDGE_REQUIRED`、`SOURCE_OUTSIDE_N_MINUS_2` 或 `DOWNGRADE_REQUIRES_ROLLBACK_OR_RESTORE`。
2. 安装器在创建 release 目录或切换服务前校验完整 bundle、版本路径、origin，并逐项确认候选能读取来源 release 正在写入的数据格式；任何失败均不写入候选状态或备份目录。
3. 每次版本变化都先创建并逐文件校验完整 Appliance 一致性备份。浏览器 origin 内需要迁移的 localStorage 指针先写入 IndexedDB 备份并回读校验；备份失败则该迁移不执行。
4. 候选通过真实 HTTPS readiness 后才提交当前 release 指针。失败时，如果候选可能改动共享数据，先恢复升级前备份，再启动旧版本。
5. 设置 → 备份显示最近的浏览器升级备份，可下载。恢复前再次保存当前浏览器状态，恢复后重载页面。
6. 单纯代码回滚只在旧 release 能读取当前持久格式且数据服务版本没有变化时允许；其他情况必须恢复升级前备份，不把新格式数据直接交给旧代码。

## 4. 项目兼容性

- 当前经过发布 fixture 验证并承诺的 project manifest 范围为 schema 1–2；schema 1 在读取时加法迁移到 schema 2。
- 现有 schema 数字是加法 revision；更高 revision 在已知必需形状有效时继续读取并保留未知字段，但超出声明的 `maxReadable` 后属于尽力前向容忍而非合同保证。
- 未来破坏性格式必须使用新的 format/generation 标识、失败关闭并另立 ADR，不得借提高现有 revision 删除既有前向兼容。
- 每次改变 schema、迁移或支持窗口都必须增加已发布来源 fixture、正反例、幂等和恢复测试；只有声明并通过的组合才可写入兼容性承诺。

## 5. 非目标

- 不提供跨 major 的隐式直接升级。
- 不把 `project.json.bak` 的抗撕裂副本冒充完整升级备份。
- 不自动删除备份、旧 release、旧工作文件夹或客户数据。
- 不承诺未列入发布清单的浏览器、数据库、CONNECT 或第三方服务降级。

## 6. 验收

- 6.3.16→6.4.0 路径判定为受支持；降级、早于基线和 N-2 窗口外路径在写状态前拒绝并给出稳定 code。
- 任意版本变化都会生成完整 Appliance 备份；候选失败后旧版本和数据恢复。
- 6.3.16 浏览器 fixture 在迁移前自动备份、摘要校验、可下载、可恢复；篡改备份不改变当前状态。
- schema 1 fixture 可迁移且保留未知字段；满足已知形状的 schema 3 加法 revision 可读取且未知字段不丢失。
- 契约、发行清单、运行手册和测试矩阵同步。

实现依据为 Accepted [`ADR-0010`](../adr/ADR-0010-versioned-upgrades.md)、[`CONTRACT-VERSION-COMPAT-001`](../contracts/VERSION_COMPATIBILITY.md)、[`RUNBOOK-VERSION-UPGRADE-001`](../runbooks/VERSION_UPGRADE.md) 和 Completed [`EP-UPGRADE-001`](../exec-plans/completed/EP-UPGRADE-001-versioned-upgrades.md)。
