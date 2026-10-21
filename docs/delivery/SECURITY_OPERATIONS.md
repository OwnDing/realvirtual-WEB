---
doc_id: OPS-SEC-001
title: 供应链扫描、发布证据与独立测试
status: approved
owner: security
last_reviewed: 2026-10-20
authority: normative-process
---

# 供应链扫描、发布证据与独立测试

关联：[EP-SEC-001](../exec-plans/active/EP-SEC-001-supply-chain-and-script-security.md)、[验收矩阵](../acceptance/SECURITY.md)。

## 本地与 CI

使用 Node 22.22.2 / npm 10.9.7、锁定的 CycloneDX 6.0.1 和严格 schema 验证库。运行 `npm ci --ignore-scripts --no-audit --no-fund` 后执行 `./scripts/verify.sh supply-chain`。应用测试/构建仍按既有 Harness 完成其必要 OCCT 补丁等准备；安全扫描本身不安装依赖或执行 lifecycle 脚本。

证据在 `test-results/security/`：`npm-audit.json` 原始查询，`inventory.json` 全包证据，`dependencies.cdx.json` CycloneDX 1.5，`licenses.json`/`vulnerabilities.json` 决策，`THIRD-PARTY-NOTICES.txt` 正文集，`summary.json` 输入 commit/dirty、lock/policy/例外/分诊摘要、工具版本和覆盖。npm registry 没有可固定的 advisory 数据库版本，报告明确写 null 并记录查询时间，不伪造版本。缓存只保存经 integrity 校验的公开归档，每次使用重新验签。

CI 的 Supply Chain Gate 不依赖其他 job 的成功，失败也上传 JSON/Markdown/notices（不上传归档缓存），保留 30 天。原五门禁保留。每天 04:23 UTC 的 schedule 在默认分支执行；只有 workflow 合入默认分支后 GitHub 才开始调度，不把 PR 中的配置说成已启用。维护者可手动 dispatch，支持分支的候选版本需分别复扫。工作流仅 contents:read，无生产或客户密钥。

返回 0 才表示此次公开 npm 范围通过；策略失败返回 1；输入/工具/报告不完整返回 2。失败不能被 `continue-on-error`、空报告或静默基线化转换为成功。

脚本专项运行 `node scripts/security/test-script-boundaries.mjs`；生产构建后运行 `node scripts/security/test-script-production.mjs`。后者在回环地址提供合成 GLB，禁止非本地请求，验证 URL 请求、实际 UI 确认、部署禁用、撤销及换模型。`script-tests.json` 和 `script-production.json`/截图由 Browser job 独立上传；未提供真实 PLC 或客户内容。

## 分诊和许可证复核

责任角色：安全维护者分诊，依赖维护者修复，发布负责人汇总，权利/合同 Owner 审定商业分发义务。实际具名责任人须在对应记录填写，角色名不是已经签收。

新漏洞出现后核实 exact path/version/integrity、上游 advisory、使用范围及可达性。High/Critical 立即阻断候选发布；已有部署依影响紧急评估。保留上游修复版本、复现及回归证据。只有批准的精确安全例外才写入 `security/exceptions.json`，到期自动红；Low/Moderate 跟踪在 `security/triage.json`。不从 npm audit 的 `fixAvailable` 自动执行降级/强制更新。此轮 handlebars 和 DOMPurify 用明确修复版本覆盖上游旧精确 pin；移除 override 前须确认上游锁已修复并复扫。

许可报告的失败项逐个补齐：上游版本/修订、归档与正文摘要、权利来源、适用范围、分发义务和批准记录。平台包只指向许可证网页而未携带正文时，应取同一版本的可追溯正文并审定归属，不能随便复制另一个 MIT 文本。LGPL 原生/WASM 库需列对应源码、修改/重链接等实际义务证据；字体/数据保留署名与其许可。未完成时保持红色。法律/供应商文件留受控交付位置，公共仓库只放脱敏索引。

## 实际制品

先构建，再运行：

```sh
node scripts/security/release-evidence.mjs collect web dist
node scripts/security/release-evidence.mjs collect demo-player dist/demo-player
node scripts/security/release-evidence.mjs collect appliance /absolute/path/to/candidate-bundle
```

工具记录全部文件/字节数/SHA-256、实际 Vite 模块与资源图、未映射文件。报告在 test-results 中，不写进运行配置、不引入客户离线运行时外呼。构建图不能覆盖所有 postbuild 文件和复制资源，`unmappedFiles` 是必须复核的待办。QuickJS npm wrapper 与内嵌引擎、OCCT wrapper 与 WASM/内存补丁、字体、复制库、容器及原生服务分别取证；构建 artifactSetSha256 变化后原审核失效。

正式验证使用 `release-evidence.mjs verify <target> <directory> <reviewed-evidence.json>`：须有同一干净 commit/lock、24 小时内通过的依赖扫描、无 High/Critical、当前文件集完全一致，以及带 owner/证据摘要的 `artifact-provenance`、`license-obligations`、`embedded-components` 复核；Appliance 另需 `os-and-native-vulnerabilities`。这些复核项均绑定当前 artifactSetSha256。空复核模板默认失败。此校验器检查证据绑定，不能替代审阅证据的真实性。镜像/原生扫描器的适配、真实发布 SBOM 与上述人工取证未完成之前，目标保持未验收。

产品发布材料同时包含适用 CycloneDX SBOM、notices 正文集、摘要 manifest、例外、内部测试报告和第三方报告索引。客户通知模板记录受影响版本/利用条件/缓解/修复版本/验证方式/联系人；发出通知须另行获得授权。

## 独立渗透测试任务书

启动前由 Owner 冻结机构与合同、目标 commit/制品 digest、拓扑、测试账号与角色、允许来源/动作、窗口、停止条件、恢复方式和报告接收人。只允许隔离测试环境，不测试生产 PLC/客户网络；不得向外部平台上传客户模型、凭据或运行数据。

建议范围：适用 OWASP ASVS 5.0 L2 控制与 WSTG 4.2 方法，另加 QuickJS/桥接/原生代码确认专项。覆盖恶意模型、脚本入口、内容/项目授权混淆、getter/Proxy/异常/资源耗尽、宿主信号写与关闭后回调；Appliance 访客/运维授权、每资源访问检查、分享撤销、会话/CSRF/Origin、路径与上传、CSP/WebSocket、备份恢复；CONNECT/MCP/调试暴露面和制品来源。逐项列适用、不适用、未测及原因，不声称 OWASP 认证。

交付正式报告必须含方法/范围/环境/限制、发现与复现、风险分级、修复 commit、复测结果、残余风险签收。完整报告受控存放；公开只发布经批准的脱敏摘要。Critical/High 未关闭不得正式交付。重大授权/沙箱/服务端改动重新评估复测范围。内部回归、npm 审计和 AI 分析均不能冒充独立报告。

## 回滚

回滚应用代码时同时回滚配套依赖 lock/配置/构建图，但不能静默恢复 v1 项目级授权。运行问题可通过部署 `scripting: {sandbox:false,native:false}` 禁用两个脚本入口。安全门禁保持阻断并重新取证，不以回滚测试或关闭 check 绕过风险。
