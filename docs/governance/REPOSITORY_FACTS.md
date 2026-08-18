---
doc_id: GOV-REPO-FACTS
title: 仓库事实与验证方法
status: approved
owner: maintainers
last_reviewed: 2026-08-18
authority: normative-process
---

# 仓库事实与验证方法

本文件不把易漂移值伪装成永久事实。表中的“观察值”只说明 2026-08-18 建立治理基线时看到的状态；执行任务时必须运行“验证方法”。

| 事实 | 基线观察值 | 每次任务的验证方法 |
| --- | --- | --- |
| Git 分支 | `develop` | `git status --short --branch`、`git branch -vv` |
| Git remote | `origin` 指向 `OwnDing/realvirtual-WEB` | `git remote -v`；不得从文档猜测推送目标 |
| 项目版本 | `6.3.27` | 读取 `package.json` |
| Node 要求 | `>=18` | 读取 `package.json#engines` 并运行 `node --version` |
| 私有 sibling | 基线时不存在 | 检查 `../realvirtual-WebViewer-Private~`；公共路径必须独立通过 |
| 默认公共 TypeScript 门禁 | `tsconfig.json` | `./node_modules/.bin/tsc -p tsconfig.json --noEmit` |
| 完整 maintainer TypeScript 门禁 | `tsconfig.full.json`，可能依赖私有 sibling | 只有依赖存在且任务明确需要时运行 |
| 测试 | Vitest Node + Browser、Playwright E2E | 读取 `package.json`、`vite.config.ts`、`playwright.config.ts` |
| 文档状态 | 根 `doc-*.md` 尚未逐份治理审计 | 查看 [`../LEGACY_DOCUMENT_REGISTER.md`](../LEGACY_DOCUMENT_REGISTER.md) |

## 必做工作树检查

每个修改任务开始和结束都应记录：

```bash
git status --short --branch
git diff --stat
git diff --check
```

用户已有改动属于用户，不得因为与任务无关而清理。`.DS_Store` 等未跟踪文件可以报告，但未经要求不得删除。

## 源码规模只用于风险判断

建立基线时约有 1000 个 `src` 文件、1200 个 `tests` 文件；`src/main.ts`、`src/core/rv-viewer.ts` 和 `src/plugins/layout-planner/index.ts` 是大型编排文件。数字会漂移，不作为验收指标；它们只说明跨这些文件的变更需要更窄的模块边界、特征测试和 ExecPlan。
