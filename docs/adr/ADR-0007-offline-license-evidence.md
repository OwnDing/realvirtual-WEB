---
doc_id: ADR-0007
title: 自有离线许可证作为部署层合同凭证
status: draft
adr_status: proposed
owner: architecture
last_reviewed: 2026-08-26
authority: proposed
---

# ADR-0007：自有离线许可证作为部署层合同凭证

## Context

当前 `src/core/hmi/license-store.ts` 通过 `connectRestFetch` 向 CONNECT 网关的 `/license/status`、`/license/activate`、`/license/deactivate` 查询和变更授权状态（`license-store.ts:184`、`:252`、`:272`）。那是**上游 realvirtual 产品的授权体系**，本仓库只持有该契约的浏览器客户端一半。私有化部署的客户内网连不上本项目的服务器，该体系对本项目无效。

三项事实约束了可选方案：

1. **本项目不发布任何服务端。** 五种交付形态全部是静态包或 ESM 库（`vite.config.ts:755` `base: './'`；`scripts/bunny-deploy.mjs:18-23` 的形态表）。没有 Electron/Tauri（全仓 grep 无命中）。`mcp-bridge/` 是开发机上的 stdio MCP 服务，绑定 `127.0.0.1`，不进任何客户交付物。
2. **默认零外呼是规范性要求，不只是偏好。** 出厂 CSP 是 `connect-src 'self'`（`index.html:8`），默认 `egress.mode: deny-external`（`public/settings.json`），构建门禁 `scripts/assert-runtime-external-origins.mjs` 会因 `src/` 中出现硬编码外部主机而失败。Approved `PS-CONFIG-001` §6 把「零跨 origin 请求」写成验收条件。任何需要联网激活的授权设计都是**违反已批准规格**，不是不方便。
3. **AGPL-3.0-only 使技术强制在结构上不成立。** 完整对应源码随每次网络部署发布（`README.md:325-333`），因此校验代码、编译进包的公钥和每一个功能位判断都是公开的，被授权方在法律上有权修改。`LICENSE:376` 更明确规定非许可性附加条款属于 "further restrictions"，接收方**有权直接删除**；`LICENSE:451` 规定不得对 AGPL 已授予的权利额外收费或设限。同时 `LICENSE:193` 明确「You may charge any price or no price for each copy that you convey, and you may offer support or warranty protection for a fee」——**收费与交付合法，技术锁定不成立**。

因此必须现在决定：在不能联网、不能保守秘密、不能技术强制的前提下，授权系统到底是什么。

## Decision

**授权系统的产物是「合同凭证 + 防篡改审计记录」，不是访问控制。**

许可证文件回答的是「这份部署对应哪一份合同、哪些功能位、有效到哪一天、谁签发的」，并且这个回答**不可伪造、不可篡改、可离线验证、可在审计时出示**。它不回答「能不能用」——那由合同回答，违约救济在合同不在代码。

据此作出以下具体决定。

### D1 独立签名文件，同源加载，零外呼

许可证是独立文件 `license.rvlic`，与 `settings.json` 同目录，通过 `${import.meta.env.BASE_URL}license.rvlic` 加载。

同源请求在 `decideEgress` 中于 allowlist 之前提前返回（`src/core/deployment/egress-policy.ts:54-57` `reason: 'same-origin'`），因此**不需要新增 `EgressPurpose`**，也不需要改 CSP。相对路径先按 `runtimeBaseUrl()` 解析再比较 origin（`egress-policy.ts:42`），`settings.json`、`scenes/index.json`、`models.json` 已是同一模式的先例（`rv-app-config.ts:243`、`main.ts:491`、`main.ts:924`）。

反面决定：**不做联网激活，不做"首次激活一次"的例外**。它同时被 CSP、默认 egress 策略和构建门禁三重阻断，且违反 `PS-CONFIG-001` §2/§6。

部署配置新增 `license` 段（走 schema 根部 `additionalProperties: true`）：

    "license": { "required": true, "path": "license.rvlic", "installId": "XYV-INST-9F2A4C81" }

`required` 缺省为 `false`。**未声明 `required: true` 的部署完全不进入授权子系统**——公共 CDN 演示、社区构建和每一个开发检出都不显示任何授权文案。缺少这个开关会让「没有许可证文件」与「这份部署本来就不需要许可证」变成同一个状态，从而在公开演示上显示"未授权"。`path` 用现有 `relativeAssetUrl()`/`RELATIVE_ASSET_RE`（`deployment-config.ts:96`、`:119-122`）校验，拒绝任何 scheme 与协议相对 `//`，从而在配置层就锁死同源。

加载器对响应体设**硬上限 16 KiB**，超限即拒绝，不做 Base64 解码——许可证是几百字节量级的文件，无界解码一个客户可替换的同源响应没有理由。

### D2 签名覆盖载荷字节本身，不做规范化 JSON

文件结构：

    {
      "rvlic": 1,
      "payload": "<base64，载荷 UTF-8 字节>",
      "sig": "<base64，64 字节 Ed25519 签名>",
      "cert": { "pub": "...", "org": "...", "sig": "..." }
    }

验证方按严格 Base64 解出 `payload` 的**原始字节**，直接验签，**验签通过后才 `JSON.parse`**。

这消除了整类规范化攻击：没有键序问题、没有重复键问题、没有 Unicode 规范化问题、没有空白差异问题，因此**不需要 JCS/RFC 8785，也不需要复刻 `rv-sig-verify.ts` 中那套保留字节偏移的 JSON 扫描器**（`locateSignature`，`rv-sig-verify.ts:148`）。那套扫描器的存在理由是 GLB 必须原地保持字节长度不变（`RV_SIG_PLACEHOLDER`，`rv-sig-verify.ts:29`），独立文件没有这个约束。

严格 Base64 解码采用现有的「重新编码后比对」反可塑性检查（`rv-sig-verify.ts:85` `return bytesToBase64(out) === value ? out : null;`），拒绝非规范编码。

### D3 域分隔前缀 `RV-LIC-V1`

签名消息为：

    "RV-LIC-V1" ‖ u32LE(payload.length) ‖ payloadBytes

沿用现有 `RV-KEY-V1` 客户证书的构造法（`rv-sig-verify.ts:251-260`：前缀 ‖ 公钥 ‖ u32LE 长度 ‖ NFC 规范化 UTF-8）。前缀与长度前缀共同保证：一份许可证签名**不可能**被当作 GLB 文件签名或客户密钥证书使用，反向亦然。缺少域分隔时，同一把私钥在两个协议间即产生跨协议伪造面。

### D4 自有信任根，与上游密钥彻底分离

新增 `src/core/licensing/rv-lic-public-key.ts`，导出 `RV_LIC_ROOT_PUBLIC_KEY_BASE64`。私钥只存在于签发环境的 `RV_LIC_SIGN_PRIVATE_KEY`，**不进仓库、不进构建产物、不进日志**。

**禁止复用** `RV_SIG_ROOT_PUBLIC_KEY_BASE64`（`src/core/persistence/rv-sig-public-key.ts:10`）：其私钥半边在上游的 `RV_SIGN_PRIVATE_KEY` 发布密钥中（同文件 `:6-10` 自述），用它签发本项目的授权等于把本项目的合同凭证签在上游的密钥下。

`cert` 字段沿用 RV-KEY-V1 两级委托结构，使经销商可在不接触根私钥的情况下签发；`cert` 缺省时 `payload` 直接由根密钥签名。

### D5 共享 Ed25519 原语上提

新增 `src/core/crypto/rv-ed25519.ts`，承载今天在 `rv-sig-verify.ts` 中私有的三件东西：`decodeStrictBase64`、`bytesToBase64`、`verifyEd25519`（分别在 `rv-sig-verify.ts:79`、`:91`、`:262`，**均未导出**）。`rv-sig-verify.ts` 改为从该模块引入，行为不变。

爆炸半径已核实为小：`verifyRvSigBuffer`/`verifyRvSigDirect` 的生产消费方只有 `rv-scene-loader.ts:117,460` 和 `rv-glb-reference-resolver.ts:39,157`；`sigToBase64` 全仓零消费方，是纯死导出面。

### D6 安装同步 sha512 钩子，使非安全上下文可验证

**这是本 ADR 中唯一影响「能不能用」的决定。**

`crypto.subtle` 仅在安全上下文可用。私有化 on-prem 的典型形态恰恰是**局域网 IP 上的明文 HTTP**（`connect-store.ts:688-692` 的 `isLoopbackHostname` 只承认 `localhost`/`127.0.0.1`/`::1`，局域网 IP 不在其列），该形态下 `crypto.subtle` 为 `undefined`。

现有双路径在该形态下**两条都失败**：WebCrypto 路径无 `subtle` 直接抛出；`@noble/ed25519` 回退路径的 `verifyAsync` 经由 `hashes.sha512Async`，而它同样调用 `subtle()`，其实现是 `cr()?.subtle ?? err('crypto.subtle must be defined, consider polyfill')`（`node_modules/@noble/ed25519/index.js:125`），`err` 无条件抛出（同文件 `:51-54`）。`hashes.sha512`（同步钩子）出厂为 `undefined`（`:794`）。`@noble/ed25519@3.1.0` 运行时依赖为空，`@noble/hashes` 只是它的 devDependency 且**当前未安装**（`node_modules/@noble/hashes` 不存在）。

结论：**今天在明文 HTTP 局域网部署上，本仓库的 Ed25519 验证 100% 返回 `unverifiable`。** 这既影响将要新增的许可证验证，也已经影响现有的模型签名验证——属于本次发现的既有缺陷。

决定：把 `@noble/hashes` 提升为正式 `dependencies`，在 `rv-ed25519.ts` 中安装同步钩子 `hashes.sha512 = sha512`，使 `noble.verify()` 在**完全没有 WebCrypto** 的环境下也能工作。验证顺序变为：WebCrypto Ed25519 →（失败）noble 同步/异步 →（仍失败）`unverifiable`。

### D7 绑定是审计断言，不是锁

许可证**同时**携带两个绑定维度，两者都比对（Owner 2026-08-27 决定）：`installId`（交付时由签发工具同时写入许可证载荷与 `settings.json`）与 `hosts[]`（允许的主机名列表，支持单层 `*.` 前缀通配；回环名只有显式列出才匹配）。任一不符即进入 `mismatch`。

两个维度互补而非冗余：`installId` 在主机名不可用或无意义的形态下仍然有效（CONNECT 自服务的 on-prem 页面 origin 通常是回环，`rv-embed` 形态下 origin 是第三方宿主页）；`hosts[]` 则在客户把交付物整份复制到另一台机器时仍能反映实际运行位置。

必须如实承认其性质：`settings.json` 是客户自己托管的、未签名的明文 JSON，且**失败即开**——404、网络错误、JSON 非法一律静默返回 `{}`（`rv-app-config.ts:236-238` 自述，实现在 `:244-259`）。主机名绑定在目标拓扑中恰好退化：CONNECT 自服务的 on-prem 形态下页面 origin 就是网关 origin（通常是回环），`rv-embed` 形态下 origin 是第三方宿主页。浏览器内**不存在**硬件指纹——唯一硬件相邻信号是 WebGL adapter 字符串，本仓库已记录其不可靠（`src/core/engine/rv-gpu-info.ts:12-19`）。全仓也**不存在**任何 per-install 持久标识：约 50 个 storage key 全部是 UI 偏好或文档缓存；`crypto.randomUUID()` 的 16 处使用没有一处被持久化为安装身份。

因此：绑定不匹配**只记录与展示**，进入 `mismatch` 状态，不改变可用性。它的价值在于审计时能出示「这份签名许可证声明它签发给 X，而这台机器自称是 Y」——签名保证了前半句不可伪造，这正是凭证系统能提供的全部，也是它需要提供的全部。

### D8 时钟不可信，到期按三重下界推算，回拨只作诊断

浏览器内不存在可信时钟：`Date.now()` 就是 OS 时钟，使用者拥有它；`performance.now()` 不跨刷新存活。本仓库的既有设计已经承认这一点——今天唯一权威的时间戳 `effectiveNow` 是由 CONNECT 网关**发给**浏览器的（`license-store.ts:31`），而离线场景下它按定义不存在。

因此到期是**尽力而为的算术**，取三个下界的最大值：

    effectiveNow = max(Date.now(), highWaterMark, Date.parse(payload.issuedAt))

1. `Date.now()` —— 正常情况。
2. `payload.issuedAt` —— **零成本、零存储、不可被清除**。许可证不可能在签发之前就在运行，因此把系统时钟拨到 1970 只会读出签发日，即合同期的第 0 天。仅这一条就在不依赖任何存储的前提下让最朴素的"改 BIOS 时钟"手法在整个合同期内失效。
3. 持久化高水位标记 —— 记录本安装观察到过的最大时刻，写入浏览器偏好存储。它随 profile、隐私模式和清缓存而丢失，因此是**尽力而为的补充**，不是依赖项。

回拨检测（`Date.now()` 显著低于高水位）产出 `clockRollback` 诊断，进入审计记录与提示文案，**绝不降低可用性**。理由与 D7 一致：这是凭证系统，不是访问控制；而且工业现场时钟错乱有大量正当原因（主板电池耗尽、NTP 缺失、时区误配）。

设计上的取舍是明确的：时钟错误的最坏后果是**一条错误的横幅，而不是一条停掉的产线**。

### D9 到期只降级创作，绝不降级运行与操作

**永不阻断**：3D 运行、信号接入与刷新、PLC 读写、报警、KPI、趋势、多用户观察、打开与查看既有工程。

理由是安全而非商务：HMI 是操作界面，一个突然无法下发停机指令的 HMI 是安全事故，任何合同都不能要求它。

**逐级降级**（`now` 相对 `notAfter`）。宽限期默认 **30 天**（Owner 2026-08-27 决定），由载荷 `graceDays` 覆盖并钳制在 `[0, 180]`：

| 状态 | 条件 | 行为 |
| --- | --- | --- |
| `not-required` | 部署未声明 `license.required` | 授权子系统完全不启用，**无任何授权文案** |
| `valid` | 剩余 > 30 天 | 全功能 |
| `expiring` | 剩余 0–30 天 | 全功能 + 可关闭的到期提醒，每日再现 |
| `grace` | 超期 0 至 30 天 | 全功能 + 不可关闭横幅 + 角标水印 |
| `readonly` | 超期超过 30 天 | 运行与操作全保留；**保存新更改**停用 + 水印 |
| `mismatch` | 签名有效但绑定不符 | 全功能 + 说明性横幅（写明许可证声明的与实际运行的），不锁定 |
| `unverifiable` | 签名无法验证 | 等同 `grace` 呈现，**永不锁定** |
| `invalid` | 签名/格式非法 | 等同 `grace` 呈现 + 明确提示，**不锁定**（见下） |
| `absent` | 声明了 `required` 但文件缺失 | 等同 `grace` 呈现 + 明确提示，不锁定 |

`mismatch` 单独成态而不并入 `invalid`：绑定不符在现场压倒性地是**正当运维事件**——客户把安装迁到新主机名、从备份恢复到新机器。按篡改处理只会制造支持工单，而重新签发是分钟级操作。

`invalid` 与 `absent` 同样不锁定。在合同凭证定位下，「拿不出有效凭证」的后果是审计上说不清，不是运行时被惩罚；而在 AGPL 下锁定也拦不住任何有意绕过的人（`LICENSE:376`），只会伤到配置出错的正当客户。

`readonly` 的强制点是 `decideSaveVerb`（`src/core/editor/rv-save-document.ts:277`）——纯函数、同步、已有 `'blocked'` 动词与 `reason` 字段（`:102`、`:104-112`），且已有三条只读拒绝话术可扩展（`:283-303`）。它是唯一保存路径 `saveDocument()` 的判定依据，生产调用点只有两处（`scene-document-view.ts:204`、`smart-asset-editor/save-flow.ts:30`）。该文件的注释已经写明设计意图：按钮保持可按，把原因说出来，而不是静默失败（`:96-100`）。

**明确不使用** `RvDocument.canApply`（`src/core/ops/rv-document.ts:119`）作为强制点：`applyOp` 对被拒绝的 op **静默丢弃**（`:365-368`，直接 `return`，不记录不抛出），`applyOpDetached`（`:378`）连 promise 都丢掉。用它做许可证阻断会造成静默数据丢失。同理不在 `SceneStore._afterOpsChanged`（`scene-store.ts:2963`）加闸——那是 schedule 之前的 return，会在无提示的情况下丢失内存中的改动。

### D10 席位与信号上限是合同条款，浏览器端只读数不拒绝

`limits.seats` 与 `limits.signals` 写入许可证并展示，但**不作为拒绝依据**。

浏览器无法观察其它浏览器。今天的 `maxSignals`/`admittedSignals` 由 CONNECT 服务端算出后仅供渲染（`license-store.ts:99-105`），且随 D11 一并移除，因此本项目侧不存在任何可继承的上限计数。本地信号注册 `SignalStore.register()`（`rv-signal-store.ts:1122`）没有计数器也没有拒绝路径。多用户 `playerCount`（`multiuser-plugin.ts:1179`）是展示值，且 `operator`/`observer` 角色由 URL 参数客户端自述（`multiuser-plugin.ts:417`）。

决定：新增**本地信号计数读数**用于审计展示（「本部署当前 3,214 / 合同 5,000」），不新增拒绝路径。席位数只出现在许可证与合同文本中。把无法执行的上限写成"强制"是虚假承诺。

### D11 删除上游 CONNECT 授权查询

Owner 2026-08-27 决定：整体移除 `/license/status`、`/license/register`、`/license/activate`、`/license/deactivate` 四个调用及其 UI、类型与文案。那是上游产品的授权业务，本项目不再充当它的客户端。

删除面：`license-store.ts` 整个文件；`LicenseSection.tsx`（注册/激活/停用对话框）；`ConnectOptionsWindow.tsx:529-535` 的 License 区块；`connect-store.ts` 中搭载的授权轮询（`:1168-1172`）、断连清理（`:1119-1122`）与 `activateProfile` 的重取（`:2109-2113`）；`ConnectPanel.tsx` 中由 `/license/status` 驱动的额度预检与呈现（`signalBudgetGate` `:3709-3722`、Add 按钮闸 `:3819`、额度指示 `:315-345`/`:1028`、超额文案 `:3804-3811`、逐行着色 `:2632-2657`/`:3621`、设置齿轮徽标 `:832-841`）；`shell.license.*` 33 条文案与 `connect` 命名空间中的额度文案；四个相关测试文件中对应的用例。

**必须保留** `connect-rest.ts` 的 `connectRestFetch`：它被 `news-store.ts`、`connect-update-store.ts`、`connect-store.ts`、`ai-consent-store.ts` 共用，与授权无关。`ai-consent-store.ts:16` 与 `rv-storage-keys.ts:13` 中引用 `LICENSE_TERMS_VERSION` 的注释需同步改写。

**运维不会失明**：网关自身的授权问题由网关 `/status` 独立上报，与 `/license/status` 无关——`CONNECT_ERROR_MESSAGES.LICENSE_REQUIRED`（`connect-store.ts:832`）与 `SignalLimitExceeded` 状态（`:862`、`ConnectPanel.tsx:285`/`:301`/`:1381`）在删除后原样存活。失去的只有绑定信号**之前**的额度预览与 Add 按钮预检闸，而该闸本就刻意失败即开（`ConnectPanel.tsx:3709-3722`），拦截能力接近于零。

风险已核实为低：本仓库无上游 remote（`git remote -v` 只有 `origin`），`license-store.ts` 全部历史仅 3 次提交，删除不会造成反复合并冲突。

## Alternatives

- **JCS/RFC 8785 规范化 JSON 后签名**：拒绝。引入一个必须逐字节正确的规范化实现，且浏览器与 Node 两侧必须完全一致；D2 的字节直签在零成本下达到同样效果。
- **复用 GLB 的 `rv_sig` 占位符原地签名方案**：拒绝。它的全部复杂度（字节偏移扫描、重复键检测、定宽占位符）来自 GLB 必须保持字节长度，独立文件没有该约束。
- **JWT / JWS 紧凑序列化**：拒绝。会引入算法协商字段（`alg`）这一经典降级攻击面，以及一个新依赖；本场景只需要单一固定算法。
- **机器指纹绑定**：拒绝。浏览器内不可实现（D7 证据）。写进方案等于承诺一个交付不了的东西。
- **联网激活（哪怕仅一次）**：拒绝。违反 Approved `PS-CONFIG-001`，且被 CSP、egress 默认值和构建门禁三重阻断。
- **到期硬锁定 / 黑屏**：拒绝。安全上不可接受（D8），且在 AGPL 下三分钟即可被删除，属于对客户的骚扰而非保护。
- **代码混淆、反调试、自校验**：拒绝。与 AGPL 的源码交付义务直接冲突，且对持有源码的一方无效。
- **保留上游 CONNECT 授权查询并在 UI 中标注其归属**：拒绝（Owner 2026-08-27）。它是上游产品的授权业务；网关自身的授权问题已由网关 `/status` 独立上报，保留它只是多维护一套与本项目无关的授权客户端。

## Consequences

**正面**：私有化部署首次拥有可离线验证、可审计出示的授权凭证；默认零外呼不被破坏；共享 Ed25519 原语上提后模型签名与许可证共用一条经过测试的路径；D6 顺带修复既有的非安全上下文验证失效缺陷；D11 移除一套与本项目无关的上游授权客户端，`gatewayAllowed` 这类死字段随之消失。

**代价**：新增一个运行时依赖 `@noble/hashes`；新增签发 CLI 与私钥保管责任（密钥泄露即全量重签）；`rv-sig-verify.ts` 需要一次纯搬运重构，必须先冻结行为再迁移（`GOV-CONSTITUTION` §8）；D11 使仍在使用上游 CONNECT 的客户失去绑定信号前的额度预览——网关仍会在超限时拒绝并报 `SignalLimitExceeded`，但操作员要到尝试绑定之后才知道，这是本决定已知且接受的退化。

**长期约束**：许可证载荷是版本化契约，只加不减；`rvlic` 版本号变更需新 ADR。绑定与上限的"不强制"性质必须在产品规格与合同中同步表述，不得在后续迭代中被静默改成强制——那会使已签合同的客户在升级后失去可用性。

## Compatibility and Migration

无许可证文件的现有部署行为**完全不变**（`absent` 状态即今天的行为）。`settings.json` 新增字段走 schema 根部 `additionalProperties: true`（`schema/v1/deployment-config.json:6`），旧客户端忽略未知字段；`validateDeploymentConfig` 已保留未知顶层键（`deployment-config.ts:320` 的 `{ ...raw }`）。

GLB/`rv_extras`、rv-ODT、NodeId、项目文档 ID、存储 key 与既有资产**不受影响**。`rv-sig-verify.ts` 的导出面不变，模型签名验证行为不变（D5 是纯搬运；D6 使原本 `unverifiable` 的非安全上下文变为可验证，是严格改进）。

## Validation

- 载荷字节直签的正例/反例单元测试：改一个字节、改 Base64 填充、换非规范编码、去掉 `cert`、用错误根密钥、跨协议重放（拿 GLB 签名当许可证签名）。
- D6 的关键验证：在 `crypto.subtle` 被 stub 掉为 `undefined` 的环境下断言验证**成功**——这是"能在明文 HTTP 局域网上工作"的唯一证据。
- 状态机在时间边界上的表驱动测试：`notAfter` 前后各 1 秒、`grace` 边界、时钟回拨、**时钟拨到 1970 时由 `issuedAt` 下界兜底**、`required: false` 时子系统完全静默、绑定不符落入 `mismatch` 而非 `invalid`。
- 加载器上限测试：超过 16 KiB 的响应体被拒绝且不进入 Base64 解码。
- `decideSaveVerb` 在 `readonly` 下返回 `'blocked'` 且 `reason` 可读；同时断言 PLC 写、信号刷新、模型运行**未被阻断**。
- Node 侧签发 CLI 与浏览器侧验证器的交叉验证（现有 rv-sig 套件缺这一环，见 `tests/rv-sig-verify.test.ts:107` 只用 WebCrypto 自签自验）。
- 不可本地验证、必须如实披露的：真实客户内网、真实时钟偏移、真实气隙安装、真实经销商签发流程。

## Rollback or Supersession

删除 `license.rvlic` 即回到 `absent` 状态，等价于本 ADR 之前的行为——**没有任何数据迁移需要撤销**。代码层面 D5/D6 可独立保留（它们是纯改进），D1–D4、D7–D9 可整体回退到上一发布版本。

密钥轮换不需要新 ADR：`cert` 的两级结构允许在不更换根密钥的前提下更换签发密钥。更换**根**密钥需要发新版本客户端，属于已知代价。

若未来本项目自建服务端（`OD-001` 的组织/云端方向），联网授权成为可能，届时必须以新 ADR 替代本记录，且必须保持离线路径可用——气隙客户不会消失。
