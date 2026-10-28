---
doc_id: SNAPSHOT-LEGAL-PHASE-A-20261026
title: 阶段 A 许可与权利取证快照
status: snapshot
owner: security
last_reviewed: 2026-10-27
authority: snapshot
---

# 阶段 A 取证快照

本轮结案状态与范围核对见 [结案核对单](CLOSEOUT.md)，已选路线见 [ADR-0021](../../../adr/ADR-0021-agpl-commercial-delivery.md)，持续发布阻断见 [证据登记](../../../governance/COMMERCIAL_RELEASE_GATES.md)。下列取证数字和原始失败不因结案讨论而改变。

## 结论与范围

用户已选 **AGPL 商业交付，主要面向中国大陆，无上游单独授权书**。本次完成仓库事实、两份 npm 锁文件的路径清点和证据采集、特殊组件/资产范围登记、法律边界研究与交付材料。**2026-10-27 用户确认按定性与清点结案，阶段 A 已关闭；律师签收和当前制品正式分发仍未验收，OD-010/A-01–A-08 保持 open。** 取证日期仍为 2026-10-26，本次状态更新不构成重新扫描或补齐许可。

基线：`97f3936867f4f8db9dcaa543372dcc9723d74b57`，起始 develop 干净，版本 6.3.27。采集环境 Node v22.22.2 / npm 10.9.7。输入哈希见 [summary.json](summary.json)，报告自身摘要见 [checksums.json](checksums.json)。结论只适用于记录的输入，不能套到以后版本。

## 文件导航

- [商业与法律定性](../../../references/COMMERCIALIZATION_PHASE_A.md)：已选路线、AGPL 义务、上游关系、中国大陆销售边界。
- [律师/上游/合同审阅稿](../../../references/PHASE_A_REVIEW_PACK.md)：未对外发送或签署。
- [非 npm 与资产登记](NON_NPM_REGISTER.md)：运行时、镜像、内嵌库和资产的具体边界。
- [逐项整改与验收](REMEDIATION.md)：所有阻断项的责任角色、证据和关闭条件。
- [完整 npm 清单 CSV](npm-inventory.csv) / [JSON](npm-inventory.json)：1,086 条路径，保留来源、integrity、许可声明和证据摘要。
- [逐项义务与处置 CSV](review/obligations.csv)：每条路径的技术结果、补证状态、实际分发范围的证据限制与建议行动。
- [原始许可失败清单](npm-findings.csv)：不因补证手工改写原门禁结论。
- [许可证正文库](license-texts.json)：按 SHA-256 去重的采集正文，包内相对路径保留在清单。
- [上游精确提交补证](supplements/review.json) / [正文](supplements/texts.json) / [摘要](supplements/checksums.json)。
- [README/代码中的许可片段](review/local-notices.json) / [补充复核摘要](review/summary.json) / [摘要校验表](review/checksums.json)。
- [非 npm 原始证据](non-npm-evidence.json)、[94 项资产/静态候选清单](asset-inventory.csv)、[1,638 项跟踪输入摘要](tracked-inputs.csv)。资产表仅元数据，不复制模型本体。

## 实测数字及含义

| 范围 | 路径数 | 名称+版本去重 | 取证错误 | 原策略通过/失败 |
| --- | ---: | ---: | ---: | ---: |
| WEB 主项目 | 900 | 859 | 0 | 800 / 100 |
| MCP bridge 独立工具 | 186 | 185 | 0 | 137 / 49 |
| 合计 | 1,086 | 跨两树合并为 997 | 0 | 937 / 149 |

“取证错误为 0”表示每条路径都取得经过身份校验的 manifest 和采集结果，**不表示每条都有许可证正文或已经履约**。MCP bridge 不在本机安装；通过与 lockfile SHA-512 对账的公开 npm 归档取证，不安装、不运行脚本，不伪称已安装树门禁通过。

原始 149 条失败包含 142 条缺少被现有扫描器识别的独立正文文件，以及 OFL/CC-BY/LGPL/组合表达式待复核项，原因有重叠。缺正文按名称+版本去重为 141 项：

- 122 项通过 registry 元数据的精确 gitHead 定位到上游许可证文件；元数据与锁文件 tarball integrity 一致。此关联是发行者提供的来源线索，不能代替对二进制内嵌组件的完整审查。
- 5 项在本地同版本 README/源码头找到完整许可片段：esrecurse、imurmurhash、is-module、isarray、schemes。
- 14 项仍未取得完整的包级正文证明，详见整改表。stackback 还发现了 V8 BSD 声明，不能只保留其 manifest 的 MIT 标签。

补证没有修改 `security/policy.json`、`exceptions.json`、依赖或原扫描器；149 条原技术失败仍原样保留，不能把 122+5 项直接标成“已获法务批准”。已选 MIT/Apache 等 OR 分支由现有 SPDX 判定器记录；AND 不会按任选一项处理。

资产/静态候选 94 项包括 63 个模型/资产容器、28 个资源/静态文件、1 个 HDR、1 个 PDF worker、1 个 PDF。字体在 npm 层另行登记。名称、Git 跟踪或自行生成的标记不能单独证明所有素材权利；此表也不是最终安装包的文件清单。

## 具体补证发现

- `public/pdf.worker.min.js` 与本机 pdfjs-dist 5.4.296 的 `build/pdf.worker.min.mjs` 字节相同，SHA-256 为 `dbcae78a691b3c501508f74b774c6066a57a14a76cefdc9e25ad86b651bb75d5`。解决了拷贝来源映射，不代表已验证最终包中 NOTICE 完整性。
- QuickJS variant 的随包 LICENSE 同时包含 wrapper 和 QuickJS 的 MIT 文本，已纳入正文库；具体内嵌修订和产物关系仍应按制品验收。
- OCCT 的 wrapper 与 OCCT LGPL 正文已取得；本项目有 WASM/glue 补丁。精确源版本、适用例外和源码/修改履约仍待补齐。
- 本机 sharp-libvips 的 versions.json 列出 28 个内嵌组件；npm 的顶层 LGPL 标签不足以说明这些组件全部义务，版本表已收录。
- 现有 dist 的构建图与根 lockfile 摘要匹配，并显示 stats-gl 进入 WEB 构建。构建图未证明当前源码/所有复制资源与最终发布物匹配，本次未新构建或宣称 release-certified。

## 重现

在仓库根目录、当前已经准备的依赖环境运行；每次选择**尚不存在**的输出目录，工具拒绝覆盖历史证据：

```bash
node docs/references/collect-phase-a-evidence.mjs test-results/phase-a/recheck
node docs/references/collect-phase-a-supplements.mjs test-results/phase-a/recheck
node docs/references/review-phase-a-evidence.mjs test-results/phase-a/recheck
```

第一项使用既有 inventory/policy API，公开归档先校验完整性再只读解析；对 DefinitelyTyped 的特殊 tar 根目录另用已安装 tar 读取，不落盘解包。第二项仅向公开 npm registry 和 raw.githubusercontent.com 发起 GET，不发送客户内容或私有依赖树。第三项要求相应同版本本机包及既有 dist 构建图，缺失时失败而非伪造证据。所有工具只用于本次分析，不能替代正式发布流程。

## 验证与限制

已实际执行三项取证工具并对账；基础采集输入在前后保持一致。2026-10-26 `./scripts/verify.sh governance` 通过（173 份治理文档、链接、兼容性生成物、96 项用户帮助）；三个工具 `node --check` 与 `git diff --check` 通过。独立 Python 校验确认全部报告摘要、许可正文引用、路径唯一性、CSV 行数、补证关系以及 1,638 项当前输入字节一致。详细记录见 [ExecPlan](../../../exec-plans/completed/EP-LEGAL-001-phase-a-commercialization.md)。

未运行漏洞审计、完整 Supply Chain Gate、产品构建、浏览器或真实设备测试；本次不变更产品。未下载/审计全部 OCI 镜像或各 OS/架构原生制品、未证明客户资产权利、未取得外部法律意见。没有修改 LICENSE、贡献协议、运行时、锁文件或许可白名单，也没有外部消息、采购、提交或推送。

## 回滚

本次仅本地文档、分析工具和摘要/许可证据。回滚精确移除本次新增文件及对应索引/OD 登记，保留其他工作树和既有报告；不涉及运行时数据、客户环境或外部状态。
