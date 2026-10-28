---
doc_id: SNAPSHOT-LEGAL-SUPPLEMENTS-20261026
title: 精确上游提交许可证补证
status: snapshot
owner: security
last_reviewed: 2026-10-26
authority: snapshot
---

# 上游补证

[review.json](review.json) 记录 registry 精确版本/完整性与发布者 gitHead 的关联；[texts.json](texts.json) 保存找到的许可证候选，摘要见 [checksums.json](checksums.json)。122 个版本找到候选、19 个未找到；后续本地包内片段分析又为其中 5 个补到完整文本，见 [复核](../review/README.md)。

候选映射不证明所有内嵌代码都被覆盖，不改变原安全门禁，也不构成法务放行。由 [补证工具](../../../../references/collect-phase-a-supplements.mjs) 生成 JSON，修改工具或输入后输出到新的目录，不手工编辑生成证据。完整范围见 [阶段快照](../README.md)。
