---
doc_id: SNAPSHOT-LEGAL-NON-NPM-20261026
title: 阶段 A 非 npm 组件与资产范围
status: snapshot
owner: security
last_reviewed: 2026-10-26
authority: snapshot
---

# 非 npm 组件与资产

本表登记已识别范围和待补证，不冒充实际发布镜像/原生制品的全量内部 SBOM。原始摘要与配方在 [non-npm-evidence.json](non-npm-evidence.json)，每个候选文件在 [资产表](asset-inventory.csv)。

| 范围/组件 | 现有证据 | 尚缺什么 | 首发处理建议 |
| --- | --- | --- | --- |
| 本项目代码与修改 | AGPL-3.0-only、历史 README/CLA、Git 记录 | 全部交付入口对应源码、署名恢复、贡献事实 | 保留原声明，逐版本源码交付和重建验收 |
| schema | schema/LICENSE 为 CC-BY-4.0 | 实际分发时署名/许可/修改说明 | 作为独立许可范围登记，不能仅放根 AGPL |
| OCCT / occt-import-js 0.0.23 | 随包两份 LGPL 正文，WASM/glue 摘要，补丁脚本 | 内嵌 OCCT 精确修订/例外、源码与修改履约 | 不把 wrapper 版本当内嵌库版本；补证或批准不含 CAD 的交付范围 |
| QuickJS 0.32.0 wrapper/variant | 随包 wrapper 与 engine 的 MIT 声明 | 内嵌修订与实际 WASM 字节映射 | 保留双方通知，不只写 npm 包名 |
| Inter 字体 | @fontsource/inter 5.2.8 的 OFL-1.1 正文 | 最终字体文件、保留名称/修改与随包文本 | 作为字体许可独立履约 |
| 拷贝 PDF worker | 与 pdfjs-dist 5.4.296 字节一致 | 最终包 Apache/NOTICE 链 | 随实际工件保留适用声明 |
| sharp/libvips | 平台包声明及 linux-arm64 内嵌 28 组件版本表 | 每平台实际内嵌许可、源码/修改和分发判断 | 开发工具不自动等于客户分发，也不从清单删除 |
| Node.js 24.20.0 | linux-arm64 下载摘要与 notice 模板 | 精确二进制全量内嵌许可 | 不能只写顶层 MIT |
| Caddy 2.11.4 | linux-arm64 下载摘要与 Apache notice 模板 | 选定二进制/镜像内组件与正文 | 模板不代替实际 license 文件 |
| Forgejo 15.0.7 | 下载摘要、GPL-3.0-or-later notice | 精确构建的对应源码和履约 | 不能靠本项目 AGPL 自动覆盖 Forgejo 义务 |
| InfluxDB 2.9.1 / CLI 2.8.0 | 下载摘要、MIT notice 模板 | 各自实际产物和内嵌依赖 | 不套用其他大版本的许可 |
| WinSW 2.12.0 | MIT notice 模板 | Windows 目标二进制/摘要/内嵌范围 | 本次 Linux 记录不证明 Windows 合规 |
| OCI 镜像 | 5 个 linux-arm64 digest 锁：Caddy/Node/Debian/Forgejo/InfluxDB | 每个实际镜像包清单、正文、对应源码/履约 | NOASSERTION 保持待审，不算全部已清点 |
| realvirtual CONNECT | 当前 notice 明确为 Proprietary 模板，正式构建拒绝占位标记 | 使用与再分发权、确切二进制和许可条件 | 无证据不随包再分发；用户自购安装或不含该组件须另确认可行交付方式 |
| 私有 sibling | 当前不存在 | 若未来纳入，单独许可及组件证据 | 公共 AGPL 许可不授予不存在的私有模块 |

## 资产分组与取证方法

| 候选路径组 | 风险/线索 | 关闭方式 |
| --- | --- | --- |
| public/models、public/scenes、public/library、public/embed 下 GLB | 原上游示例、自制、导入和衍生素材可能混合 | 逐文件来源许可；自制保存生成源和素材权利；提取模型继承原资产权利审查 |
| public/library/PaintLine/PaintRobot.glb | 提取脚本指向 DemoRobotIK.glb | 同时核对原模型和提取代码，不能仅证明脚本自有 |
| public/models/library/imports、Custom | 文件名不能证明来源或商业再分发权 | 素材来源/下载许可/作者授权；不足则从批准的首发工件排除 |
| public/aasx | 厂商相关资产容器 | 查明容器内附件和厂商许可范围，不按根 AGPL 一概处理 |
| public/envmaps/empty_warehouse_01_1k.hdr | 环境图来源需证明 | 取得准确来源、版本和许可；文件名相同不等于相同权利来源 |
| public/pdf/fanuc-crx-educational-cell-manual.pdf | 第三方手册 | 取得复制/随包分发权，或正式排除，不以可在线阅读推断可重发 |
| logo、favicon、PWA、og-image 和 SVG 等 | 产品品牌与上游署名不同义务 | 记录制作/使用权；满足上游适用署名，不暗示官方授权 |
| 其他静态文件 | 配置、索引、示例也可能引用上述资产 | 以最终构建复制结果校验，避免只是关闭 UI 但文件仍被打包 |

不复制或上传模型、手册及客户内容作为报告附件；使用路径、大小、SHA-256 与权利材料编号关联。源码/文件在仓库可读不是第三方资产单独再分发的充分证明。

## 不可据此作出的结论

- 不能说“1,086 条 npm 路径完成，所以整个安装包合规”。
- 不能把 94 项候选全部叫作侵权资产；当前结论是逐项权利尚待审定。
- 不能把 CONNECT 的 AGPL 客户端接口代码视为 CONNECT 运行时的再分发授权。
- 不能为了清单绿色删除记录、修改许可白名单或擅自换掉资产。排除交付范围应明确到实际工件并验证，产品取舍另行记录。
