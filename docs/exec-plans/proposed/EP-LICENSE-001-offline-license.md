---
doc_id: EP-LICENSE-001
title: 自有离线许可证黄金切片
status: draft
plan_status: proposed
owner: engineering
last_reviewed: 2026-08-26
authority: proposed
---

# EP-LICENSE-001：自有离线许可证黄金切片

## Purpose

让私有化部署的客户在**内网完全不可出网**的条件下，拥有一份可离线验证、不可伪造、可在审计时出示的授权凭证；让许可证到期时产线**继续运行**，只有创作能力逐级降级；让销售合同里的到期行为说明与代码行为逐条对应。

成功的观察方式：把 `license.rvlic` 放进部署目录，断网、把系统时钟拨到到期日之后，应用仍然渲染、仍然连信号、仍然能下发 PLC 写指令，只是出现水印且"保存"变为带原因的停用态；删除该文件，应用回到今天的行为。

## Scope

- 许可证文件格式、签名构造与严格解码（`rvlic` v1）；
- 自有 Ed25519 信任根与两级委托证书；
- 共享 Ed25519 原语上提，以及**非安全上下文可验证**的同步 sha512 钩子；
- 部署配置的 `license.required` 开关，以及同源、失败关闭、有大小上限的加载路径；
- 状态机（`not-required`/`valid`/`expiring`/`grace`/`readonly`/`mismatch`/`unverifiable`/`invalid`/`absent`）与基于 `issuedAt` 下界的时钟推算；
- 到期降级：`decideSaveVerb` 阻断分支、水印、横幅、审计读数；
- Node 侧签发 CLI 与浏览器侧验证器的交叉验证；
- 移除上游 CONNECT 授权查询及其 UI、类型与文案；
- 合同到期行为说明文档；
- 中英文文案、Schema、契约、验收矩阵与门禁同步。

## Non-goals

- **不做任何技术强制或防绕过**：不混淆、不反调试、不自校验、不完整性自检。AGPL 下持有源码的一方有权删除校验（`LICENSE:376`），做这些是安全剧场。
- **不阻断运行与操作**：3D 运行、信号接入、PLC 读写、报警、KPI、多用户观察在任何授权状态下都不被降级。
- **不做联网激活、不做吊销列表拉取、不做遥测回传**：违反 Approved `PS-CONFIG-001` 的默认零外呼。
- **不实现席位与信号上限的拒绝路径**：浏览器无法观察其它浏览器，写成"强制"是虚假承诺。只做本地读数展示。
- **不做机器/硬件指纹**：浏览器内不可实现。
- **不改动** GLB/`rv_extras`、rv-ODT、NodeId、项目文档 ID、存储 key、既有资产与模型签名的对外行为。
- **不删除** `src/core/hmi/connect-rest.ts` 的 `connectRestFetch`——它被 News、CONNECT 更新、连接与 AI 同意四处共用，与授权无关。
- 不建立组织/租户/云端账户体系（`OD-001` 阻塞范围）。

## Required Documents and Decisions

- `GOV-CONSTITUTION`、`GOV-AI-SAFETY`、`GOV-DOC-PRIORITY`、`GOV-CHANGE`、`GOV-DOD`；
- **`OD-007` 已于 2026-08-27 关闭**（[`../../governance/OPEN_DECISIONS.md`](../../governance/OPEN_DECISIONS.md)）：宽限期 30 天、`installId` 与 `hosts[]` 双绑定、删除上游 CONNECT 授权查询、确认「合同凭证 + 防篡改审计记录」的表述进合同；
- 本计划提议的 [`ADR-0007`](../../adr/ADR-0007-offline-license-evidence.md) 必须先 Accepted；
- Approved [`PS-CONFIG-001`](../../product-specs/DEPLOYMENT_IDENTITY_EGRESS.md) 与 Accepted [`ADR-0006`](../../adr/ADR-0006-deployment-identity-egress.md)：默认零外呼与部署层状态所有权；
- Accepted [`ADR-0001`](../../adr/ADR-0001-i18n-runtime.md)：新增文案的目录与回退规则；
- M0 需新建：`PS-LICENSE-001` 产品规格、`CONTRACT-LICENSE-FILE-001` 契约、`schema/v1/license-file.json`。

## Current Repository Facts

以下为 2026-08-26 在分支 `license/l0-3-offline-license`（基线 `develop`，工作树干净，远程 `origin`，PR #6）实测：

**授权现状**
- `license-store.ts` 通过 `connectRestFetch` 查询上游 CONNECT 的 `/license/status`（`:184`）、`/license/activate`（`:252`）、`/license/deactivate`（`:272`）。
- 轮询搭载在 CONNECT 面板的 2 秒轮询上（`connect-store.ts:1168-1172`），且仅在面板**同时**打开且已连接时运行（`ConnectPanel.tsx:801-806`）；面板关闭即不再刷新。
- 今天被授权状态真正阻断的客户端能力**只有一处**：Browse 窗口的 Add 按钮（`ConnectPanel.tsx:3819`），其判定 `signalBudgetGate`（`:3709-3722`）刻意**失败即开**。其余全部是展示。
- `gatewayAllowed` 解析入类型后在 `src/` 中**从未被读取**，是死字段。
- 现有测试四个：`tests/license-store.test.ts`（纯 mapper）、`tests/LicenseSection.test.tsx`（走 `statusOverride` 测试缝）、`tests/connect-license-ui.test.tsx`（唯一覆盖真实闸的）、`tests/i18n-shell.test.tsx`。

**密码学现状**
- `@noble/ed25519` 固定 `3.1.0`，正式 `dependencies`，已在 `vite.config.ts:865` 的 `optimizeDeps.include`。
- v3.1.0 导出 13 个名字；`utils.randomPrivateKey` **不存在**（已更名 `utils.randomSecretKey`），`etc.sha512Sync` **不存在**。按 v1/v2 API 写的代码会直接崩。
- `verifyEd25519`（`rv-sig-verify.ts:262`）、`decodeStrictBase64`（`:79`）、`bytesToBase64`（`:91`）三个最该复用的函数**都未导出**。
- 严格 Base64 用「重新编码后比对」拒绝非规范编码（`:85`），是可直接复用的反可塑性手法。
- `RV-KEY-V1` 客户证书构造（`:251-260`）是与 GLB 无关的完整两级委托方案，可原样复用。
- Worker 分流（`:399`、阈值 25 MB）**只**因 GLB 签名覆盖整个多兆字节文件而存在；许可证文件比阈值小若干数量级，该路径**不可复用**。
- `scripts/rv-sign-glb.mjs` 全程用 `node:crypto`（`:12-17`、`:185`），含裸公钥转 SPKI 的 12 字节 OID 前缀技巧（`:210`）与 PKCS#8/base64 双形态私钥摄入（`:101-110`），签发 CLI 可整段照抄。
- `sigToBase64` 全仓零消费方；`verifyRvSig*` 的生产消费方仅 `rv-scene-loader.ts:117,460` 与 `rv-glb-reference-resolver.ts:39,157`。

**非安全上下文（决定成败）**
- `crypto.subtle` 仅安全上下文可用；本仓库已在 `rv-script-runtime-loader.ts:125` 记录该事实，并在 `rv-project-manager.ts:60`、`rv-project-documents.ts:222-229` 做过降级处理。
- `rv-sig-verify.ts` **没有**这层保护：WebCrypto 抛出后走 noble，而 noble 的 `verifyAsync` 经 `hashes.sha512Async` 同样调用 `subtle()`，实现为 `cr()?.subtle ?? err(...)`（`node_modules/@noble/ed25519/index.js:125`），`err` 无条件抛出（`:51-54`）；同步钩子 `hashes.sha512` 出厂 `undefined`（`:794`）。
- `@noble/ed25519@3.1.0` 运行时依赖为空，`@noble/hashes` 仅为其 devDependency 且**当前未安装**（`node_modules/@noble/hashes` 不存在）。
- **因此：在局域网 IP 的明文 HTTP 部署上，本仓库今天的 Ed25519 验证 100% 返回 `unverifiable`。** 这是私有化 on-prem 的典型形态（`connect-store.ts:688-692` 的回环判定不含局域网 IP）。既有模型签名验证同样受影响，属既有缺陷。

**部署与外呼**
- 同源请求在 `decideEgress` 中于 allowlist 之前提前返回（`egress-policy.ts:54-57`），相对路径先按 `runtimeBaseUrl()` 解析（`:42`）。**同源许可证文件不需要新增 `EgressPurpose`。**
- 出厂 CSP `connect-src 'self'`（`index.html:8`）已允许同源 fetch；默认 `egress.mode: deny-external`（`public/settings.json`）。
- 远程许可证检查则需在至少四处注册新 purpose（含 `apply-deployment-profile.mjs:12-15` 的 CSP 映射），本计划不做。
- `settings.json` **失败即开**：404 / 网络错误 / 非法 JSON 一律静默返回 `{}`（`rv-app-config.ts:244-259`）。许可证不能搭这条通道，必须自带失败关闭的加载路径。
- Vite `base` 默认相对 `'./'`（`vite.config.ts:755`），必须用 `import.meta.env.BASE_URL` 寻址，不能用前导 `/`。
- deployment-config schema 根部 `additionalProperties: true`（`schema/v1/deployment-config.json:6`），新增顶层字段不破坏 Schema；各 section 内部均 `false`。

**降级面**
- 唯一保存路径 `saveDocument()`，生产调用点仅两处（`scene-document-view.ts:204`、`smart-asset-editor/save-flow.ts:30`）；判定函数 `decideSaveVerb`（`rv-save-document.ts:277`）是纯同步函数，**已有** `'blocked'` 动词与 `reason` 字段（`:102`、`:104-112`）和三条只读话术（`:283-303`）。
- **不可用作强制点**：`RvDocument.canApply`（`rv-document.ts:119`）对被拒 op **静默丢弃**（`:365-368`），`applyOpDetached`（`:378`）丢弃 promise；`SceneStore._afterOpsChanged`（`scene-store.ts:2963`）的闸在 schedule 之前，会静默丢失内存改动。
- **不存在**：任何水印（`vite-env.d.ts:16-18` 自述已移除）、任何应用级只读标志、`src/interfaces/` 中任何写闸、`SignalStore.register()`（`rv-signal-store.ts:1122`）上的任何计数或上限、多用户席位核算。
- `mode:viewer` 看似只读，实为 28 条 `hiddenIn` UI 规则且可被 `settings.json` 的 `ui.visibilityOverrides` 覆盖（`App.tsx:182-183`），**不是**强制边界。
- `__RV_COMMERCIAL__` 在 `vite.config.ts:811` 定义但 `src/` 中无人读取，不可当作现成的分级闸。
- 横幅 z-index 已拥挤且无中央注册表：9400 / 9490 / 9500（三处并列）/ 20000 / 21000。
- `StorageNoticeBanner`（`:42`、`:96-101`、`:226` 优先级表）是最接近的可复用模板。

**门禁**
- 五项必需检查名：`Governance Gate`、`Static Gate`、`Node Gate`、`Browser Gate`、`Build Gate`（`.github/workflows/quality-gates.yml`），`main` 与 `develop` 均 strict + enforce_admins + 不要求 review，**直接 push 已不被接受**。
- i18n 基线在全部八个受门禁类别上**为零**，且 `tests/i18n-inventory.node.test.ts` 硬断言为零——**没有一条新硬编码文案的余量**。
- `shell.license.*` 文案子树已存在（`en-US.ts:202-249`、`zh-CN.ts:914-956`），应扩展而非新建 namespace。类型绑定在 zh-CN 上（`i18next.d.ts:14-22`），**必须先写 zh-CN 才能编译**。
- 测试归属由**文件扩展名**决定：`*.node.test.ts` 走 Node 配置，其余 `tests/**/*.test.{ts,tsx}` 走 Playwright Chromium。断言用户可见文案的浏览器测试必须在 `beforeAll` 里 `await setLocale('en-US')`。
- 本检出是社区版（两个私有 sibling 均不存在），`npm run typecheck`（`tsconfig.full.json`）在此**无法通过**；社区门禁是 `./node_modules/.bin/tsc -p tsconfig.json --noEmit`。
- 治理门禁对 `docs/**` 的硬要求：六个 front matter 键、`draft→proposed` 组合、`doc_id` 全局唯一、**新文档必须被同目录 README 以裸文件名链接**、链接必须在磁盘上存在（锚点不校验）。ExecPlan 文件名须匹配 `EP-<AREA>-<NNN>-<slug>.md`，且目录与 `plan_status` 必须一致。

## State Ownership and Compatibility

许可证是**部署层权威状态**，与 `ADR-0006` 的身份/服务/外呼同层：由部署交付方写入，项目、模型、用户偏好、会话与 URL 参数**均不得放宽**它。

许可证文件本身是唯一权威；`settings.json` 中的 `deployment.id` 是**自述值**，只用于与许可证声明比对并产生审计提示，不构成授权来源。派生的授权状态是内存中的只读快照，不写入项目文档、不写入 GLB、不参与保存。

时钟回拨检测的高水位标记写入浏览器偏好存储，属于**尽力而为的证据**，非权威——它随浏览器 profile、隐私模式和清缓存而丢失，不得据以拒绝服务。

兼容性：无许可证文件时行为与今天完全一致。`rv-sig-verify.ts` 的导出面与模型签名验证行为不变（原语上提是纯搬运；同步 sha512 钩子使原本 `unverifiable` 的环境变为可验证，是严格改进）。

## Allowed Paths

- `src/core/crypto/**`
- `src/core/licensing/**`
- `src/core/persistence/rv-sig-verify.ts`
- `src/core/persistence/rv-sig-public-key.ts`
- `src/core/editor/rv-save-document.ts`
- `src/core/engine/rv-signal-store.ts`
- `src/core/hmi/LicenseSection.tsx`
- `src/core/hmi/ConnectOptionsWindow.tsx`
- `src/core/hmi/App.tsx`
- `src/core/hmi/*Banner.tsx`
- `src/core/hmi/license-store.ts`（删除）
- `src/core/hmi/ConnectPanel.tsx`
- `src/core/hmi/connect-store.ts`
- `src/core/hmi/ai-consent-store.ts`
- `src/core/hmi/rv-storage-keys.ts`
- `src/core/deployment/deployment-config.ts`
- `src/core/i18n/catalogs/**`
- `src/main.ts`
- `schema/v1/deployment-config.json`
- `schema/v1/license-file.json`
- `scripts/rv-sign-license.mjs`
- `scripts/rv-sign-license.d.mts`
- `package.json`
- `package-lock.json`
- `public/settings.example.json`
- `tests/licensing-*.test.ts`
- `tests/licensing-*.test.tsx`
- `tests/licensing-*.node.test.ts`
- `tests/rv-sig-verify.test.ts`
- `tests/rv-sig-deploy.node.test.ts`
- `tests/license-store.test.ts`（删除）
- `tests/LicenseSection.test.tsx`（删除）
- `tests/connect-license-ui.test.tsx`
- `tests/i18n-shell.test.tsx`
- `docs/**`

## Forbidden Paths

- 任何形式的私钥、密钥材料或签发凭据进入仓库、构建产物、测试快照或日志；
- `schema/v1/rv-odt.json`、`schema/v1/specification.md`；
- `public/**/*.glb` 及既有演示资产；
- `src/interfaces/**`（本计划不新增工业写闸）；
- `src/core/ops/rv-document.ts`（明确不以 `canApply` 作为强制点）；
- `tests/i18n-inventory-baseline.json`（不得为放行新硬编码文案而改基线）；
- `tests/private-dependent-tests.json`、`tsconfig.json` 的生成围栏（须经 `npm run gen:private-excludes` 重生成）；
- 生成围栏与客户/私有 sibling 内容。

## Milestones

### M0 — 契约冻结（无代码）

交付：`ADR-0007` 转 Accepted；新建 Approved `PS-LICENSE-001`、`CONTRACT-LICENSE-FILE-001`、`schema/v1/license-file.json`；本计划移入 `active/`。
在签发环境生成自有 Ed25519 密钥对，公钥进 `rv-lic-public-key.ts`，私钥只进 `RV_LIC_SIGN_PRIVATE_KEY`。
验证：`./scripts/verify.sh governance`。
可观察：治理门禁绿，且新文档被各自目录 README 以裸文件名索引。

### M1 — 黄金切片：能在明文 HTTP 局域网上验签

这是**决定整个方案成立与否**的里程碑，必须最先做完。

交付：`src/core/crypto/rv-ed25519.ts`（上提 `decodeStrictBase64`/`bytesToBase64`/`verifyEd25519`，安装同步 `sha512` 钩子）；`@noble/hashes` 提升为正式依赖；`rv-sig-verify.ts` 改为引用共享模块；`src/core/licensing/rv-lic-public-key.ts`、`rv-lic-verify.ts`（`RV-LIC-V1` 域分隔、载荷字节直签、两级 `cert`）。
正例：合法许可证验签通过并解析出载荷。
反例：改一字节、改 Base64 填充、非规范编码、错误根密钥、缺 `cert` 的委托签名、**拿 GLB 签名当许可证签名重放**——全部拒绝。
关键反例：`crypto.subtle` 被 stub 为 `undefined` 时验签**仍然成功**。
验证：`npm run test:node`、`./scripts/verify.sh browser` 中的 licensing 与 rv-sig 分片、`./scripts/verify.sh static`。
可观察：`tests/rv-sig-verify.test.ts` 全绿证明模型签名行为未回归；新增的无-WebCrypto 用例证明 on-prem 形态可用。

### M2 — 签发 CLI 与交叉验证

交付：`scripts/rv-sign-license.mjs`（`--keygen` / 签发 / `--verify`）与 `.d.mts` 声明，照抄 `rv-sign-glb.mjs` 的密钥摄入、SPKI 前缀与 CLI 自调用守卫。
验证：`npm run test:node`；**Node 签发 → 浏览器验证**的交叉用例（现有 rv-sig 套件缺这一环）。
可观察：一条命令产出的 `.rvlic` 能被浏览器验证器接受；篡改后被拒。

### M3 — 加载与状态机

交付：`deployment-config.ts` 新增 `license` 段解析（`required` / `path` / `installId`，`path` 走既有 `relativeAssetUrl()` 校验锁死同源，解析必须幂等——配置每次启动被校验两次）；`src/core/licensing/rv-lic-store.ts`——同源加载 `${BASE_URL}license.rvlic`、**自带失败关闭**（不复用 `settings.json` 的失败即开）、16 KiB 响应体上限、状态机、时钟推算（`max(Date.now(), 高水位, issuedAt)`）、绑定审计比对。
验证：时间边界表驱动测试——`notAfter` 前后各 1 秒、`grace` 边界、时钟回拨、**时钟拨到 1970 由 `issuedAt` 下界兜底**、`required: false` 时子系统完全静默、绑定不符落入 `mismatch` 而非 `invalid`、超限响应体被拒。
可观察：拨动系统时钟即可在 UI 上看到状态迁移；绑定不匹配只出说明性提示不改可用性；公共演示构建上看不到任何授权文案。

### M4 — 降级与呈现

交付：`decideSaveVerb` 的 `readonly` 阻断分支（含可执行的原因句）；水印组件与横幅（复用 `StorageNoticeBanner` 的严重度/优先级模式，并为新横幅在拥挤的 z-index 带中取得明确位置）；`SignalStore.register()` 的本地计数**读数**；扩展 `shell.license.*` 文案，**zh-CN 先行**再镜像 en-US。
验证：`npm run test:node`（含 `i18n-inventory` 与 `i18n-catalog` 保持零漂移）、浏览器组件测试、`./scripts/verify.sh browser`。
可观察：`readonly` 下保存按钮仍可按且说明原因；**同一状态下 PLC 写、信号刷新、模型运行断言未被阻断**。

### M5 — 移除上游 CONNECT 授权查询

交付：删除 `license-store.ts` 整个文件、`LicenseSection.tsx`、`ConnectOptionsWindow.tsx:529-535` 的 License 区块、`connect-store.ts` 的授权轮询/断连清理/`activateProfile` 重取、`ConnectPanel.tsx` 中由 `/license/status` 驱动的额度预检与呈现、`shell.license.*` 33 条文案与 `connect` 命名空间的额度文案、以及 `tests/license-store.test.ts` 与 `tests/LicenseSection.test.tsx`。改写 `ai-consent-store.ts:16` 与 `rv-storage-keys.ts:13` 中引用 `LICENSE_TERMS_VERSION` 的注释。
**保留** `connect-rest.ts` 的 `connectRestFetch`（News / CONNECT 更新 / 连接 / AI 同意共用）。
验证：`./scripts/verify.sh static`（社区 `tsc` 会抓出所有悬空引用）、`npm run test:node`（`i18n-catalog` 双语键集必须仍然对齐、`i18n-inventory` 仍为零）、`./scripts/verify.sh browser`。
可观察：连接到 CONNECT 网关后，网关自身的授权问题**仍然**通过 `/status` 的 `LICENSE_REQUIRED` 与 `SignalLimitExceeded` 呈现（`connect-store.ts:832`、`:862`、`ConnectPanel.tsx:1381`）；消失的只有绑定前的额度预览。

### M6 — 合同、文档与全门禁

交付：合同到期行为说明（Approved 文档，逐条对应 M3/M4 的实际行为，并载明 AGPL 下的定位）；`public/settings.example.json` 增补示例；验收矩阵与 `REPOSITORY_FACTS` 同步；本计划补齐 Outcomes 后转 completed。
验证：`./scripts/verify.sh all`；PR 上五项必需 Gate 全绿。
可观察：断网 + 拨钟的端到端人工巡检记录留证。

## Progress

- [x] OD-007 四项决定由用户 2026-08-27 当前明确指令作出并关闭
- [ ] 用户批准本方案并接受 `ADR-0007`（PR #6 评审）
- [ ] M0 契约冻结
- [ ] M1 黄金切片：非安全上下文验签
- [ ] M2 签发 CLI 与交叉验证
- [ ] M3 加载与状态机
- [ ] M4 降级与呈现
- [ ] M5 移除上游 CONNECT 授权查询
- [ ] M6 合同、文档与全门禁

## Surprises & Discoveries

- **2026-08-26（起草期，已核实）**：在局域网 IP 的明文 HTTP 部署上，本仓库今天的 Ed25519 验证必然返回 `unverifiable`——WebCrypto 因非安全上下文缺席，noble 的异步回退同样依赖 `crypto.subtle` 做 sha512（`node_modules/@noble/ed25519/index.js:125`、`:51-54`、`:794`），而同步钩子未安装、`@noble/hashes` 未作为依赖存在。该形态正是私有化 on-prem 的典型形态。此缺陷**已经影响现有的模型签名验证**，不是本次新引入的。
- **2026-08-26**：`RvDocument.applyOp` 对被 `canApply` 拒绝的 op 静默丢弃（`rv-document.ts:365-368`）。若按直觉把授权闸放在这里，会造成用户改动无声消失。降级点因此改为 `decideSaveVerb`。
- **2026-08-26**：`gatewayAllowed` 在 `src/` 中从未被读取，是死字段；今天真正被授权状态阻断的能力只有 Browse 的 Add 按钮一处，且该闸刻意失败即开。"替换授权体系"的实际代码面比预期小得多。
- **2026-08-26（设计评审）**：把 `payload.issuedAt` 用作时钟下界是零成本且不可清除的——许可证不可能在签发前运行，因此把系统时钟拨到 1970 只会读出签发日。它在不依赖任何浏览器存储的前提下，让最朴素的改时钟手法在整个合同期内失效，严格优于单靠 localStorage 高水位（后者随 profile、隐私模式和清缓存丢失）。
- **2026-08-26（设计评审）**：必须有 `license.required` 开关。缺少它会让「文件缺失」与「这份部署本来就不需要许可证」塌缩成同一状态，导致公共 CDN 演示、社区构建和每个开发检出都显示「未授权」文案。
- **2026-08-26**：本仓库无上游 remote，`license-store.ts` 全部历史仅 3 次提交——删除它不会造成反复合并冲突。该选项的成本低于预期，故列入 OD-007 由 Owner 决定。

## Decision Log

- 2026-08-26：用户当前明确指令确认本系统的定位是**「合同凭证 + 防篡改审计记录」，不是技术 DRM**。据此，一切反绕过手段（混淆、反调试、自校验）列为 Non-goal，绑定与上限被如实降级为审计断言与合同条款。
- 2026-08-26：用户当前明确指令要求先开 PR 再给方案；PR #6 以 draft 建立，`OD-007` 登记为首个提交。
- 2026-08-27：用户当前明确指令作出 `OD-007` 的四项决定并据此关闭该条目——**宽限期 30 天**；**`installId` 与 `hosts[]` 两个绑定维度都要**；**删除上游 CONNECT 授权查询**；**确认「合同凭证 + 防篡改审计记录」的表述进入销售合同**。ADR-0007 与本计划已按此更新；ADR 接受与计划激活仍是独立动作，尚未发生。

## Validation

- `./scripts/verify.sh governance`（文档与治理，M0 起每个里程碑）
- `./scripts/verify.sh static`（含社区 `tsc -p tsconfig.json`、ESLint 边界、外部 origin 静态门禁）
- `npm run test:node`（含 `i18n-inventory` 零漂移、`i18n-catalog` 双语对齐、私有排除清单守卫）
- `./scripts/verify.sh browser`（8 分片 Chromium，含 licensing 与 rv-sig 回归）
- `./scripts/verify.sh build`
- `./scripts/verify.sh all`（M5）
- 关键专项：`crypto.subtle` 为 `undefined` 时验签成功；Node 签发 ↔ 浏览器验证交叉用例；`readonly` 状态下 PLC 写与信号刷新**未被阻断**的断言。
- 人工：断网 + 系统时钟拨到到期后的端到端巡检。
- **必须如实披露为未验证**：真实客户内网、真实 PLC 与产线、真实时钟偏移、真实气隙安装流程、真实经销商签发链路、移动端与 WebXR 下的呈现。

## Rollback

删除部署目录中的 `license.rvlic` 即回到 `absent` 状态，等价于本计划之前的行为；**没有数据迁移需要撤销**，不涉及 GLB、项目文档或持久化格式。

代码分层回退：M1 的原语上提与同步 sha512 钩子是纯改进，可单独保留；M3–M4 可整体回退到上一发布版本。依赖回退需同时还原 `package.json` 与 `package-lock.json`。

密钥泄露的应对是轮换签发密钥并重签存量许可证——`cert` 两级结构使其无需更换根密钥、无需发新客户端。更换**根**密钥则需发新版本客户端，属已知代价。

## Outcomes & Retrospective

待执行后补齐：实际交付范围、验证命令与输出、与本计划的偏差、未验证项、遗留债务与后续任务。
