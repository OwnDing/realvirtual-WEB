---
doc_id: EP-TRUST-001
title: 第二轮整改第 2 步：自有模型签名信任根与 README 事实更正
status: approved
plan_status: active
owner: engineering
last_reviewed: 2026-11-03
authority: normative-process
---

# EP-TRUST-001：第二轮整改第 2 步：自有模型签名信任根与 README 事实更正

## Purpose

完成后，本项目能签发自己的可信模型：浏览器只信任本项目持有私钥的 Ed25519 根，上游发布流水线签过的模型不再被视为“已验证”；README 不再宣称不存在的接口，也不再指向不存在或不属于本项目的站点。

## Scope

- `rv_sig` 信任根：`src/core/persistence/rv-sig-public-key.ts` 与 `scripts/rv-sign-glb.mjs` 中的根公钥换成用户生成的新根；测试断言两处一致、不等于上游根、不等于许可证根。
- 根密钥生成：`node scripts/rv-sign-glb.mjs --keygen <文件>`——私钥只写入仓库外的 0600 文件、不覆盖、不打印，只输出公钥。
- 签名无效横幅文案：改为同时涵盖“签名后被修改”与“签名密钥不受本安装信任”两种情况（换根后上游签名模型内容完好但校验失败，原文案“内容与签名不符”对其不实）。
- README：删除不存在的 REST 接口；接入方式改为自有网关（OPC UA）+ 可选 CONNECT；MCP 指向仓库内 Node 桥；克隆地址、Node 版本、部署选项、文档入口与页脚更正为可验证事实；改名产生的死链（`xyvirtual.io` 系列、`game4automation/XYvirtual-MCP`、`xyvirtual/XYvirtual-WEB`、`unity.com/partners/XYvirtual`）移除或改指上游真实地址。
- `doc-webviewer.md` 签名一节补充信任根归属、生成与轮换。

## Non-goals

- README 的 Contributing、License、Commercial License 段落（署名、双许可、水印条款、商业许可联系方式）：属于 OD-010 / A-01 法律与署名事项，本步不改，仅在交付报告中列出其中的死链。
- 许可证签发 CLI（`rv-sign-license.mjs --keygen` 把私钥打印到标准输出）的改造。
- 区分“被篡改”与“未受信任签名者”的新签名状态（密码学上无法区分；不改 `SignatureState` 契约）。
- 重新签名任何仓库内模型（仓库内 GLB 均无 `rv_sig`）。

## Required Documents and Decisions

OD-007 产品输入（2026-08-26：“`rv-sig-public-key.ts` 的信任根是上游公钥……本项目需要自有密钥对”）；[ADR-0007](../../adr/ADR-0007-offline-license-evidence.md)（许可证根与模型签名根分离、禁止复用上游根）；ADR-0001（i18n 目录与逐字校验）；OD-010 / [商业发布证据登记](../../governance/COMMERCIAL_RELEASE_GATES.md) A-01（署名，本步不动）；用户 2026-11-03 指令“按你建议的顺序，从第 1 步开始做，做到第 5 步”。

## Current Repository Facts

- 起点：`claude/remed2-step2-trust` 叠在第 1 步 `39c9bc2`（ADR-0027，待推送）之上，`develop` = `51cf9b2`。
- 两处根公钥均为上游值 `99rD6Wl3…`；`rv-sig-public-key.ts` 自述其私钥在上游 `RV_SIGN_PRIVATE_KEY`。无测试约束两处一致。
- 仓库内 60 个 GLB（含 3 个 LFS）均无 `rv_sig`，换根不影响随仓库提供的模型；无签名模型行为不变（`none`）。
- 签名无效时加载器保留几何与 HMI、门控逻辑，横幅允许用户逐模型启用（`rv-sig-unlock:<modelName>`）。
- README 声称的 REST 轮询接口在 `src/interfaces/` 中不存在；`xyvirtual.io`、`doc.xyvirtual.io`、`forum.xyvirtual.io` 无 DNS 记录；`game4automation/XYvirtual-MCP`、`xyvirtual/XYvirtual-WEB` 在 GitHub 返回 404；`web.realvirtual.io` 是上游 Bunny CDN。
- README 是客户工作区交付的核心文件；交付时链接按 `scripts/_workspace-lib.mjs` 重写，未交付路径的链接会令交付链接检查失败，因此新引用的 `gateway/`、`appliance/` 写为代码路径而非链接。

## State Ownership and Compatibility

信任根是编译进客户端的常量，不新增持久化状态。轮换信任根需要新的客户端构建。已用上游根签名的模型在新构建中变为 `invalid`：几何照常显示、逻辑被门控、用户可逐模型启用（既有行为）；此前保存的逐模型启用记录继续有效。私钥由用户保管，不进入仓库、构建产物、日志或测试快照。

## Allowed Paths

`src/core/persistence/rv-sig-public-key.ts`、`scripts/rv-sign-glb.mjs`、`scripts/rv-sign-glb.d.mts`、`src/core/licensing/rv-lic-public-key.ts`（仅注释：其中“模型签名根属于上游流水线”的描述在换根后不再成立；常量不动）、`tests/rv-sig-deploy.node.test.ts`、`src/core/i18n/catalogs/en-US.ts` 与 `zh-CN.ts`（`shell.signature.invalidSummary`）、`scripts/i18n-verbatim-check.mjs`（豁免一条）、`README.md`、`doc-webviewer.md`、`doc-deploy.md`、`docs/**`。

## Forbidden Paths

`SignatureState` 与加载器门控语义、GLB/`rv_extras` 格式、许可证信任根的值与签发 CLI、README 的 Contributing/License/Commercial License 段落、`LICENSE`、`CONTRIBUTING.md`。

## Milestones

1. 根密钥生成 CLI 与测试（私钥只落 0600 文件、拒绝覆盖与仓库内路径、CLI 输出不含私钥）。
2. 用户生成根密钥并提供公钥；两处常量替换；一致性/非上游/非许可证根测试转绿；横幅文案更正。
3. README 与 `doc-webviewer.md` 更正；治理、静态、Node、构建、浏览器门禁。

## Progress

- [x] M1 生成 CLI 与测试。
- [x] M2 用户于 2026-11-03 在本机运行 `--keygen` 生成根密钥（私钥只写入其本机仓库外的 0600 文件，未进入会话、仓库或日志）；公钥 `ovqirJ8h7sQ0eQLtGnb0AbMHScqcIPHDK45WoyJFjLA=` 已写入两处常量，信任根测试转绿。
- [x] M3 README 更正（文档门禁见 Validation）。
- [ ] 远程 CI 与合并。

## Surprises & Discoveries

- 首版 `--keygen` 先写私钥文件、再从公钥对象导出原始公钥，后者在当前 Node 中抛错，留下一个用户看不到公钥的私钥文件。改为先导出所有可能失败的内容、最后一次性写文件（`flag: 'wx'`）。
- 许可证 CLI 的 `--keygen` 把私钥打印到标准输出；若经 `!` 在会话中运行，私钥会进入对话记录。模型根生成因此只写文件、只打印公钥。许可证 CLI 不在本步范围，已在交付报告中列出。
- README 的大量链接来自 realvirtual→XYvirtual 的机械替换，指向不存在的域名和仓库。

## Decision Log

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-11-03 | 模型签名根改为本项目自有密钥，由用户本人生成并保管 | OD-007 产品输入；用户本轮指令；与许可证根“仓库所有者签发”的做法一致 |
| 2026-11-03 | 不新增签名状态，只更正 `invalid` 文案 | 篡改与陌生签名者在密码学上不可区分；`SignatureState` 是公共契约 |
| 2026-11-03 | README 法律段落不改 | OD-010 / A-01 需要权利人证据与法律签收 |
| 2026-11-03 | 新根公钥 `ovqirJ8h…FjLA=` 由用户本人生成并提供 | 用户当前明确指令（会话中以 `!` 运行 `--keygen`，只输出公钥） |

## Validation

本地（2026-11-03，Darwin / Apple Silicon，Node 22）：

- 换根前：`tests/rv-sig-deploy.node.test.ts` 12 条中 11 条通过，信任根一致性测试按预期失败（常量仍为上游值）；仓库内路径拒绝测试未留下文件。
- 换根后：`tests/rv-sig-deploy.node.test.ts` **12/12**（含两处一致、非上游根、非许可证根、上游根签名模型校验为 `invalid`、`--keygen` 文件 0600 / 拒绝覆盖与仓库内路径 / CLI 输出不含私钥）。
- 签名与许可证相关 Node 测试（`rv-sig-deploy`、`demo-package`、`licensing-sign`、`rv-glb-chunks`、`rv-scene-settings-into-model`）5 文件 / 72 例通过；`node scripts/i18n-verbatim-check.mjs` 通过（2,558 条 en-US，`shell.signature.invalidSummary` 按豁免登记）。
- 聚焦 Browser：`rv-sig-banner`、`rv-sig-gate-activation`、`rv-sig-verify`、`glb-bake-roundtrip`、`licensing-verify`、`commissioning-trust-activation`、`i18n-shell`、`i18n-golden-slice`、`i18n-catalog-split`、`demo-package-export` 10 文件 / 146 例通过。
- `./scripts/verify.sh governance`（191 份受治理文档）、`static`、`node`（94 文件 / 945 例通过，2 文件 / 7 例按既有条件 skip）、`build` 均退出 0。
- `CI=1 ./scripts/verify.sh browser`：八个主 shard 与独立性能套件全部通过，合计 1,062 文件 / 11,125 例通过、3 文件跳过、零失败。

远程 CI：待 PR。

## Rollback

恢复两处根公钥常量即回到上游根（不推荐：会重新信任上游流水线签名）；`--keygen` 为新增入口，删除不影响签名与校验；README 与文案可按提交回退。
