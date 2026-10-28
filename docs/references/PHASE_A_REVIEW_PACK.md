---
doc_id: REF-LEGAL-REVIEW-PACK-001
title: 阶段 A 律师任务书、上游询证与合同条款稿
status: reference
owner: product
last_reviewed: 2026-10-26
authority: reference
---

# 阶段 A 审阅材料

已确认 AGPL 路线、主要面向中国大陆、无单独上游授权书。以下均为未发送、未签署的审阅稿，不代表已建立委托关系、获得上游同意或可直接签约。分析依据与发现见 [定性备忘录](COMMERCIALIZATION_PHASE_A.md)。

## 1. 给律师的具体任务书

拟委托：为基于 realvirtual WEB 的 XYvirtual WEB 修改版出具中国大陆商业交付的开源许可与合同边界书面意见。首发暂按客户内网的数字孪生展示/演示，接受 AGPL 和客户依法取源、修改、再分发；不寻求把受覆盖的程序闭源。此描述需由销售负责人核对实际首单。

审阅对象为 HEAD `97f3936867f4f8db9dcaa543372dcc9723d74b57`，另附修改/制品摘要；根 LICENSE、历史与当前 README/贡献协议、AGPL 署名差异、两份锁文件和补充清单、Appliance/演示播放器交付配方。未提供客户模型、密钥或生产地址。

请逐项给出结论、适用事实、限制与关闭证据：

1. 安装包交付、浏览器下载和内网/外部演示访问分别适用哪些 AGPL 义务；客户、访客、员工和客户的客户如何取源。
2. 完整对应源码的具体范围：WEB、修改插件、配置、模型内执行逻辑、独立服务、模型几何和业务数据。拟采用随包源码 + 同源入口，是否足够，缺什么。
3. 获取时有效的署名要求和现行 §13.6 的关系；保留上游署名的产品展示方案与自有品牌是否合适；历史交付如存在差异如何补救。
4. 贡献协议适用范围、实际向上游提交记录、职务/委托成果及自己新增部分的归属；未来 fork 贡献政策如何处理。
5. 服务费、年度更新、源码获取、再分发、保密、到期和免责条款是否一致；不要把上游开源免责直接当成发行方向付费客户免责的全部依据。
6. OCCT/LGPL、schema/CC-BY、字体/OFL、独立 CONNECT、模型/手册等逐项义务是否已满足；未知项不得用统一免责声明替代许可。
7. 大陆签约主体与软件登记口径；必要时区分著作权、商标和商业合作身份，不宣称全部自主原创或官方授权。

所需输出：带日期和版本摘要的书面意见；“可进行/须整改/事实不足”的逐项结论；可签署的开源与服务条款附件；争议条款及历史问题处理建议。费用、交付期限、律所和具体律师尚未约定，本稿不构成采购。

## 2. 给上游的英文询证函（未发送）

Subject: Clarification of AGPL attribution and asset scope for a realvirtual WEB derivative

Hello realvirtual team,

We are preparing an independently maintained derivative of the public realvirtual WEB codebase for paid delivery and implementation services, primarily for customers in mainland China. We intend to comply with AGPL-3.0-only, provide the corresponding source, and preserve recipients' rights to modify and redistribute the covered software. We are not requesting proprietary licensing or presenting ourselves as an authorized partner.

For our review, could you clarify the following with reference to the applicable release and documents?

1. Which attribution text, logo and display requirements accompany the public code represented by commit b06e09a and its predecessors? How should these coexist with our own product and service branding?
2. Which included example models, environment maps, documents and other assets have separate licenses or third-party redistribution restrictions? Is a version-specific asset/notice list available?
3. How do you distinguish independent customer geometry and data from executable behavior or program components embedded in a GLB?
4. What is the intended scope of CONTRIBUTING.md for contributions submitted to your repository versus changes retained solely in an independently operated fork? We will separately verify the actual submission history with our contributors.
5. We do not assume that the public WEB license authorizes redistribution of CONNECT or private modules. Please identify the terms applicable if a future package includes either.

Please identify the version/date of the documents you rely on. We can share a minimal attribution mockup and component list after internal review; no customer assets are attached. This enquiry is intended to clarify existing obligations and does not accept a new commercial agreement or request permission beyond the rights already granted under the applicable open-source licenses.

Kind regards,
Product owner — legal entity and sender details to be supplied before sending

发送前需填明主体/联系人和核对首发范围。未取得用户明确发送指令，不发送此函、不创建上游 issue，也不上传仓库或模型。

## 3. 面向客户的合同附件核心条款（律师审阅稿）

### 软件与开源许可

本交付包含基于 realvirtual WEB 修改的程序及第三方组件。受 AGPL-3.0-only 覆盖的程序按该许可证提供；其他组件按交付清单所列许可提供。客户依适用开源许可享有使用、复制、修改和再分发权。服务合同不缩减这些权利，也不声称发行方拥有上游或第三方代码的全部权利。

### 费用与服务期限

报价应分别列明版本交付、安装部署、定制、培训、维护和更新服务。维护/更新服务到期，按合同终止相应服务承诺；不因此取消客户已经取得的开源许可权。不得将席位、部署数量、续费或防绕过条款解释为对 AGPL 已授予权利的额外限制。

### 对应源码与声明

发行方随约定版本提供与实际交付制品对应的源码及依法需要的构建、安装、修改和声明材料，提供获取方式与摘要。适用开源许可要求无额外费用提供的源码，不单独收取许可费。源码获取不应以购买额外维护服务为条件。

### 客户数据和独立资产

客户提供的图纸、独立几何、业务数据和其他有权保密的材料，依明确的数据处理和保密约定使用。双方应单独确认嵌入的脚本/行为是否属于受覆盖程序；保密约定不得阻止履行适用的开源许可义务。合同不允许客户向发行方提交其无权授权使用的第三方资产。

### 署名与合作身份

双方保留适用许可证要求的版权、署名和法律通知。产品或实施品牌不构成 realvirtual GmbH 的代理、授权经销或担保。第三方组件的免责与发行方自行承担的交付、维护或保证义务分别约定，并由律师审核中国法下的适用性。

以上条款是可编辑讨论文本，不包含未经确认的合同主体、价格、责任上限、法院或争议解决条款，不能直接冒充完整已审合同。

## 4. 源码交付回执模板

| 字段 | 填写内容 |
| --- | --- |
| 发行方/签约主体 | 待确认 |
| 客户与交付范围 | 待确认；避免在公共仓库填写敏感客户信息 |
| 产品版本、提交、最终补丁与制品 SHA-256 | 随每次正式交付生成 |
| 对应源码包名称、SHA-256、获取入口 | 随包；入口应在客户实际网络可用 |
| 构建/安装说明与重建证据编号 | 干净环境验证后填写 |
| 开源正文、版权与 NOTICE 清单 | 与实际制品关联 |
| LGPL 等特殊履约材料 | 精确源码、补丁及经审核的适用方案 |
| 模型/独立数据权利清单 | 权利来源和边界；不含敏感内容本体 |
| 交付日期与接收记录 | 由授权人员填写，不由 Agent 代签 |

## 5. 尚缺的事实

- 销售与服务的法律主体名称、开发者的雇佣/委托成果关系。
- 是否实际向上游提交过 PR、补丁或其他贡献，以及当时接受的协议。
- 是否已向客户/公众交付过修改版，具体版本和源码/署名提供情况。
- 首发是否包括 CONNECT、MCP bridge、CAD 导入、第三方示例模型/手册。

这些事实不阻碍本次研究与清点，但会影响最终法律意见和发布范围；没有回答不能填成“否”。
