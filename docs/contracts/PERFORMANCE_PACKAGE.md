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

预处理遇到无法表示的 primitive 或 AssetReference 场景时拒绝发布整份清单，不静默省略对象。源文件先下载完而包未准备好时放弃包，不延迟完整加载。PNG 解码前验证 IHDR 尺寸不超过512×512，防止小传输文件造成无界解码分配。

## 机器格式与限额

[Schema](../../schema/v1/performance-package.json) 描述 JSON 形状；运行时额外检查 bounds 顺序、重复 nodeIndex/primitiveIndex、路径分段与驻留预算。清单最大 4 MiB、4096 个 primitive；单资源最大32 MiB；源最大512 MiB。两级视觉几何与128/512像素 PNG 是预览资源；原始 GLB 提供完整精度。构建端 meshoptimizer 1.1.1（MIT）和 sharp 0.34.5（Apache-2.0）不进入浏览器入口或运行时权限面。

二进制 RVLP：16字节小端头，ASCII magic RVLP，uint32 vertexCount、indexCount、uvFlag（0/1）；随后 float32 XYZ、可选 float32 UV、uint32 triangle indices。法线在读取后计算。资源不携带脚本、层级元数据或工业状态。纹理使用嵌入原图生成的 PNG；不解析纹理外部地址。

运行时 LOD 对最多256个可安全替换且减少至少20%索引的高成本 Mesh 生效；多primitive节点、顶点色、蒙皮、形变和动态加工等保留原路径。视觉替身不进入模型根、节点注册表或保存，精确几何不替换。远近迟滞与画质档位控制替换。预算为保守资源估计，不宣称准确测量 VRAM。
