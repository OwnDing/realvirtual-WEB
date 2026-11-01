---
doc_id: ADR-0022
title: 逐包许可证判定与补充正文证据
status: approved
adr_status: accepted
owner: security
last_reviewed: 2026-11-01
authority: normative
---

# ADR-0022：逐包许可证判定与补充正文证据

## Context

ADR-0019 引入的 Supply Chain Gate 自 PR #18 起在每次远程运行中失败，且不在 required checks 中，因此 PR 照常合入、CI 长期红灯。2026-11-01 的远程证据（run `40645104801`）为 900 条依赖路径中 100 条许可证失败：93 条是包归档中没有正文（esbuild/rollup/napi-rs canvas/libvips 平台二进制包，以及只在 README 声明许可的旧包），7 类是策略白名单之外、需要判断的许可（OFL-1.1 字体、CC-BY 数据、OCCT 的 LGPL-2.1、sharp/libvips 的 LGPL-3.0）。

ADR-0019 已写明“统一禁用 copyleft 不适用于本项目”，但门禁只有全局 `allowedLicenses` 白名单和仅限漏洞的例外机制，没有记录“某个包的某个许可已被审定”的位置，也没有为“正文不在归档里”提供可追溯证据的位置。结果是：要么扩大全局白名单（新引入的 LGPL 依赖也会静默通过），要么门禁永远红。

2026-11-01 用户明确指令执行缺口整改第 1 步：“分诊依赖问题让 Supply Chain Gate 转绿并加进 required checks”。

## Decision

1. 新增 `security/license-decisions.json`：逐包精确判定。每条绑定一个 `package` + `version` + `integrity` + 声明的完整 SPDX 表达式，必须写明理由、分发义务、跟踪项（A-06/A-07）、Owner、批准来源和日期。判定只覆盖策略状态为 `review` 的表达式，不覆盖 `deniedLicenses`，不替代缺失的正文，不扩大 `allowedLicenses`。依赖树中不再存在的判定视为过期证据并使门禁失败。若包的 `package.json` 根本未声明许可（`license` 为空），判定须显式写 `declared: null`，`license` 为依据正文识别出的 SPDX 标识；它只适用于未声明的包，识别出的许可仍受 `deniedLicenses` 约束，且正文证据仍是必需的（2026-11-01 第 2 步网关依赖 `dequeue`、`precond` 引入此情形）。
2. 新增 `security/license-evidence.json` 与 `security/license-texts/`：当包归档内没有任何 LICENSE/NOTICE/COPYING 类文件时，按 `package` + `version` + `integrity` 精确关联一份入库正文；正文以 SHA-256 绑定，并记录来源。来源优先级：同一发布的父包正文 → 上游仓库在发布提交（`gitHead`）或版本标签处的 LICENSE → 包内 README 许可章节或 `package.json` 声明与 SPDX license-list-data 固定标签的规范原文的组合。第三类组合在正文开头逐字标明来源，不冒充上游文件。归档内已有正文的包不得再登记补充证据；未被使用的登记使门禁失败。
3. 判定与补充证据只说明“npm 开发依赖树门禁”的许可结论。实际制品的署名、对应源码、LGPL 重链接/替换等分发义务仍由 A-06/A-07 和 OD-010 跟踪，本 ADR 不关闭它们。
4. 文件名、字段和 SHA 校验在扫描联网前完成；任何格式、摘要、通配或重复错误按工具错误（退出 2）处理。

## Alternatives

- 扩大全局 `allowedLicenses`（加入 LGPL、OFL、CC-BY）：实现最简单，但任何新的 LGPL 依赖都会无声通过，违背 ADR-0019“逐项建立来源和义务证据”。未采用。
- 把许可证问题写入安全例外 `exceptions.json`：例外有最长 30 天期限、语义是“已知风险暂缓”，而许可证判定对一个固定版本是长期结论；`validateExceptions` 也明确拒绝许可证类例外（权利缺失不能被安全例外豁免）。未采用。
- 扫描时在线抓取上游正文：结果随时间和网络变化，离线复放无法复现，且引入新的外呼。未采用，正文在入库时一次性取得并以摘要固定。
- 保持红灯直到法律签收：正是当前状态，导致门禁失去拦截意义，后续真实回归被淹没。未采用；法律签收仍独立保留在 OD-010。

## Consequences

- 门禁可以转绿并加入 required checks，后续任何新的未判定许可、缺正文或版本漂移都会再次失败。
- 依赖升级会使判定/补充证据因 integrity 不匹配而失败，升级者必须重新审定；这是有意的成本。
- 入库正文约 256 KB，均为公开许可文本。
- 不改变运行时、不改变构建产物。

## Compatibility and Migration

只增加两个输入文件和一个目录；`run-supply-chain.mjs` 读取它们并纳入输入摘要。空文件（`decisions: []`、`packages: []`）等价于本 ADR 之前的行为。

## Validation

- `tests/security-policy.node.test.ts`：精确匹配接受；版本/integrity/表达式不符、拒绝许可、缺正文、过期判定、通配和重复全部失败；补充正文摘要被篡改、文件名越界、未知正文、冗余登记全部失败。
- 真实扫描：Node 22.22.2 / npm 10.9.7 下 `node scripts/security/run-supply-chain.mjs` 退出 0，900/900 路径完整，判定与补充证据无未使用项。
- 作用域：`web`（根锁文件，`security/*.json`）与 `gateway`（`gateway/package-lock.json`，`security/gateway/*.json`），正文目录 `security/license-texts/` 共用（ADR-0023）。

## Rollback or Supersession

删除两个登记文件中的条目即恢复原红灯行为。若将来引入法律审定的集中式许可证台账，可替代本 ADR，但必须保持逐包精确匹配和正文摘要绑定。
