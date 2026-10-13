---
doc_id: ACCEPT-BRAND-001
title: 白标验收矩阵
status: approved
owner: qa
last_reviewed: 2026-10-13
authority: normative
---

# 白标验收矩阵

| 要求 | 自动验证 | 人工/环境边界 |
| --- | --- | --- |
| 默认/客户 A/客户 B、旧/未来版本 | 解析器和交付 Node tests | 客户真实资源单独校验 |
| 首屏/UI/元数据/PWA 一致 | 生产 HTML 与浏览器旅程 | 安装与桌面图标更新另验 |
| 禁止项目覆盖、切换清理 | Browser store/component tests | 无私有 sibling |
| 路径、资源、注入、配色反例 | Node tests + Browser errors | 不上传客户数据 |
| 子目录/冷启动/零外呼 | 白标 E2E | 不推导所有浏览器兼容 |
| 受保护入口不暴露 settings | Access 边界回归 | 真实生产认证未验证 |
| 单 HTML 品牌离线 | 导出 tests + file 旅程 | 不改变离线保护能力 |

实施证据记录在 [ExecPlan](../exec-plans/completed/EP-BRAND-001-deployment-white-label.md)。
