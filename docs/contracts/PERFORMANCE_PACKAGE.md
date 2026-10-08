---
doc_id: CONTRACT-PERF-PACKAGE-001
title: Performance Package v1
status: approved
owner: architecture
last_reviewed: 2026-10-08
authority: normative
---

# Performance Package v1

性能包是原始 GLB 的可删除派生物。以 `<source>.perf.json` 作为可选清单入口，schemaVersion=1，source 含 byteLength 与 sha256，parts 含稳定 nodeIndex、primitiveIndex、bounds、levels。每级资源含相对 uri、byteLength、sha256、triangles。索引始终相对于源文件，不使用可变名称作身份；不向源文件盖章。

清单和每个资源有严格大小、数量和有限数检查。资源必须同源且位于清单所在目录，不允许绝对 URL、查询、片段、路径穿越或外部纹理/缓冲。资源摘要必须匹配；清单源摘要在原始数据到达时校验，未校验预览不被当成签名可信内容。失败回退原始 GLB，原始失败保留预览但不声明完整就绪。

性能包不得包含可执行脚本或用于初始化业务组件。旧 GLB/项目/rv_extras/rv_sig 不变，L2-2 单文件格式不变。运行时会话不保存预览到项目。预处理工具必须报告不支持和未简化对象；未来版本拒绝并回退。
