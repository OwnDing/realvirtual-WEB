---
doc_id: SNAPSHOT-LEGAL-REVIEW-20261026
title: 逐项义务和本地许可片段
status: snapshot
owner: security
last_reviewed: 2026-10-26
authority: snapshot
---

# 证据复核映射

- [obligations.csv](obligations.csv)：1,086 条路径的证据、义务和建议处置，不是法律批准。
- [local-notices.json](local-notices.json)：同版本本地文件的 5 个完整许可片段和 stackback 的额外 V8 BSD 声明。
- [summary.json](summary.json)：仍缺完整正文的 14 个名称+版本、PDF worker 来源、libvips 内嵌组件版本和既有构建图限制。
- [checksums.json](checksums.json)：上述生成文件摘要。

由 [复核映射工具](../../../../references/review-phase-a-evidence.mjs) 生成，修改生成源后在新目录重跑，不手改 CSV/JSON。总体结论见 [阶段快照](../README.md)。
