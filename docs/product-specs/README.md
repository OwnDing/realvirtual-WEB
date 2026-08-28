---
doc_id: PRODUCT-SPEC-INDEX
title: 产品规格索引
status: approved
owner: product
last_reviewed: 2026-08-27
authority: normative-registry
---

# 产品规格索引

产品规格描述用户行为、范围、非目标和验收，不描述偶然的当前实现。

- [`MULTILINGUAL_LOCALIZATION.md`](MULTILINGUAL_LOCALIZATION.md)：Approved 多语言与本地化产品规格；首批 `zh-CN`/`en-US`、默认中文、中文最终回退、AI 直接翻译。
- [`PAINTLINE_ASSEMBLY_MVP.md`](PAINTLINE_ASSEMBLY_MVP.md)：Approved 可手工组装涂装线 MVP；Library、稳定端口、模块库、数据驱动运行与保存重开闭环。
- [`SMART_ASSET_EDITOR.md`](SMART_ASSET_EDITOR.md)：Approved 智能资产编辑器；GLB 导入、端口/行为/信号向导、发布校验、统一保存与 Planner Library 复用。
- [`PUBLIC_DES.md`](PUBLIC_DES.md)：Approved 公开、行业无关 DES；通用事件/实体/资源/队列/路由、四种运行模式、快照、实验与跨行业验收。
- [`DEPLOYMENT_IDENTITY_EGRESS.md`](DEPLOYMENT_IDENTITY_EGRESS.md)：Approved 部署身份与默认零外呼；同一源码通过版本化部署配置交付客户身份，外部访问按 origin/purpose 明确授权。
- [`LICENSE_AND_EXPIRY.md`](LICENSE_AND_EXPIRY.md)：Approved 授权与到期行为；离线可校验的签名凭证，到期只降级创作不降级运行，含可直接引入合同的到期条款。

后续建议规格：

1. 分层配置与配置编辑；
2. 通用设备库版本、资产治理与团队发布；
3. 项目导入导出和协作。

规格必须引用相关 OD/ADR、正式契约和 [`../acceptance/ACCEPTANCE_MATRIX.md`](../acceptance/ACCEPTANCE_MATRIX.md)。
