---
doc_id: EP-CONFIG-001
title: 部署身份与默认零外呼黄金切片
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-08-25
authority: normative
---

# EP-CONFIG-001：部署身份与默认零外呼黄金切片

## Purpose

让默认构建在不访问第三方网络的情况下启动 Viewer、Planner、智能资产编辑器和 DES；让客户通过一份版本化部署配置替换可见身份而无需 fork。

## Scope

- Deployment Config v1 Schema、运行时校验、优先级与失败关闭；
- 静态首屏和 React HMI 身份；
- Analytics、News、Docs、QR、Draco、CONNECT 下载、Firebase Demo、GitHub Library、CAD 外链和 Debug CDN；
- 集中 origin/purpose 策略、CSP、静态与浏览器门禁；
- 部署脚本、示例配置、文档与验收同步。

## Non-goals

- 清除版权、许可证或对应源码告知；
- 重命名 `rv_extras`、`userData.realvirtual`、稳定 ID、存储 key 或旧资产；
- 决定项目/模型/用户/会话的完整配置覆盖关系；
- 新建组织后端、代理服务或账户权限系统；
- 真实 PLC、客户网络和生产 CDN 验收。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-CHANGE`、`GOV-DOD`；
- Approved `PS-CONFIG-001`、Accepted `ADR-0006`、`CONTRACT-DEPLOYMENT-CONFIG-001`；
- `OD-003` 的部署层子决策由用户 2026-08-25 当前明确指令批准，其余范围保持开放。

## Current Repository Facts

- 开始分支 `develop`，工作树干净，远程为 `origin`；实现分支为 `codex/deployment-identity-egress`。
- `RVAppConfig` 读取 JSON 后只检查顶层 object 并类型断言。
- 约 1020 个 `realvirtual.io` 是版权头；运行时外部入口分散在脚本、图片、Loader、WebSocket、导航和 fetch。
- Analytics/News 已有局部 opt-in；不存在覆盖全部协议的部署外呼边界。

## State Ownership and Compatibility

部署身份、服务和外呼策略写入 `settings.json`；用户偏好、项目事实、GLB/rv-ODT 与工业信号所有权不变。配置新增字段只加不减，非法配置失败关闭。

## Allowed Paths

- `src/core/rv-app-config.ts`
- `src/core/deployment/**`
- `src/core/hmi/**`
- `src/core/library/**`
- `src/core/engine/rv-scene-loader.ts`
- `src/core/engine/rv-model-config.ts`
- `src/core/engine/rv-glb-reference-resolver.ts`
- `src/core/engine/rv-asset-blob-cache.ts`
- `src/core/import/rv-import-asset.ts`
- `src/plugins/**`
- `src/interfaces/**`
- `src/main.ts`
- `index.html`
- `public/settings*.json`
- `schema/v1/deployment-config.json`
- `scripts/**deployment*`
- `scripts/assert-runtime-external-origins.mjs`
- `scripts/inject-ga-settings.mjs`
- `scripts/_bunny-lib.mjs`
- `package.json`
- `tests/**deployment*`
- `tests/rv-app-config.test.ts`
- `tests/help-url.test.ts`
- `tests/news*.test.ts*`
- `tests/connect-*.test.ts*`
- `docs/**`

## Forbidden Paths

- `schema/v1/rv-odt.json`
- `schema/v1/specification.md`
- `public/**/*.glb`
- 生成围栏与客户/私有 sibling 内容

## Milestones

1. 配置 Schema、运行时解析与 origin/purpose 单元测试。
2. 默认零外呼黄金切片和同源 QR/Draco。
3. 静态/运行时身份、构建 CSP 与服务迁移。
4. 静态门禁、浏览器行为、综合验证与 PR Gate。

## Progress

- [x] 用户批准方案，建立 Approved 规格、Accepted ADR、契约与 Active ExecPlan。
- [x] 配置与策略实现。
- [x] 品牌和服务迁移。
- [x] 门禁与本地验证。
- [ ] PR 五项 Gate、合入 `develop` 和源分支清理。

## Surprises & Discoveries

- GitHub CLI 未安装，但 Codex GitHub 连接器可创建、检查和合并 PR。
- 3Dfindit/TraceParts 当前是普通导航链接；Festo/Bosch/SEW 多数是本地 AAS 索引身份，不是自动 CAD 拉取。
- 独立 Teams 配置页原先直接加载 Office CDN，且 Teams SDK 自身包含远程有效域名更新逻辑；页面现由 Vite 本地打包 SDK，并用页面 CSP 把 `connect-src` 限制为同源。
- 代码中的大多数 `realvirtual.io` 命中属于必须保留的版权头；`rv_extras`、演示模型文件名和存储/协议标识属于兼容契约，未做全局替换。

## Decision Log

- 2026-08-25：用户批准默认拒绝外呼、部署品牌化、配置契约和防回归门禁，并要求通过 PR 合入 `develop` 后删除 PR 源分支。

## Validation

- `./scripts/verify.sh governance`
- `./scripts/verify.sh static`
- 聚焦配置、外呼、品牌、News、CONNECT 与 Help 测试
- `./scripts/verify.sh node`
- `./scripts/verify.sh browser`
- `./scripts/verify.sh build`
- 聚焦 Playwright 默认零外呼旅程
- GitHub 五项 required Gate

本地证据（2026-08-25）：

- `./scripts/verify.sh static`：通过；Governance、文档发布、外部 origin、ESLint 和 TypeScript 均通过；随后把扫描扩展到运行时 JSON，当前覆盖 1,091 个文件。
- `./scripts/verify.sh node`：63 文件通过、2 文件跳过；640 例通过、7 例跳过。
- `./scripts/verify.sh browser`：8 个分片及隔离性能套件全部通过。
- `./scripts/verify.sh build`：通过；14,926 个模块完成生产构建，主入口与 `teams-config.html` 均产出，GA 在无完整双变量时保持关闭，部署身份/CSP 投影成功。
- `npx playwright test e2e/deployment-egress.spec.ts --project=chromium`：2/2 通过；主应用默认启动和 Teams 配置入口均未观察到跨源请求或 socket。
- 真实 PLC、客户网络、生产 CDN、生产 Teams 宿主和人工全界面品牌巡检未验证。

## Rollback

回退该 PR 即恢复旧运行时；新增配置字段会被旧版本忽略。未产生外部数据迁移或真实设备写入。

## Outcomes & Retrospective

本切片建立了版本化部署身份、失败关闭的 origin/purpose 策略、默认关闭的外部服务、本地 QR/Draco/Teams SDK、构建期身份与 CSP 投影，以及静态和浏览器反退化门禁。法律告知与稳定兼容标识被有意保留；完整多层配置优先级继续由 `OD-003` 管理。远程 Gate、合并和分支清理完成后归档本计划。
