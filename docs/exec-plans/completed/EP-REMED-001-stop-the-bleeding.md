---
doc_id: EP-REMED-001
title: 缺口整改第 1 步：门禁转绿、公开 Stub 如实报告与上游部署流水线
status: approved
plan_status: completed
owner: engineering
last_reviewed: 2026-11-01
authority: normative-process
---

# EP-REMED-001：缺口整改第 1 步：门禁转绿、公开 Stub 如实报告与上游部署流水线

## Purpose

完成后：

1. Supply Chain Gate 在远程 CI 上为绿色，并作为第六个 required check 拦截合入；
2. 公共构建中，任何依赖 `src/private-stubs/*` 空实现的 MCP 工具都在写入前返回 `{ unavailable: true }`，不再报告 `{ ok: true }`；
3. 上游 realvirtual 的 Bunny CDN 发布流水线不会在 push `main` 或打标签时自动运行。

## Scope

- 依赖：非破坏性 `npm audit fix`（锁文件），剩余 Low/Moderate 逐条分诊。
- 门禁：ADR-0022 的逐包许可判定、补充正文证据，以及对应自检。
- 运行时：`src/core/rv-public-stub.ts` 公开 Stub 契约，22 个空桩模块加标记，MCP 编辑器/视图/观察工具在调用前检查。
- CI：`deploy-bunny.yml`、`deploy-embed-bunny.yml` 改为仅手动触发；Supply Chain Gate 加入 `develop` required checks（远程设置，读回留证；用户 2026-11-01 明确“只合并到 develop，不需要合并到 main”，`main` 保护不变）。

## Non-goals

- 不实现被桩替代的编辑器/机构/IK/CSG 能力（第 5 步）。
- 不关闭 A-06/A-07/OD-010 的法律与实际制品履约。
- 不改变 Browser/E2E 套件范围，不处理 EP-GOV-004 的 13 个未归因 e2e 失败。

## Required Documents and Decisions

- [ADR-0019](../../adr/ADR-0019-supply-chain-and-script-trust.md)、[ADR-0022](../../adr/ADR-0022-exact-license-decisions.md)、[EP-SEC-001](../active/EP-SEC-001-supply-chain-and-script-security.md)
- [OPEN_DECISIONS](../../governance/OPEN_DECISIONS.md)：OD-005（required checks 已关闭，本计划是其扩展）、OD-010（不受影响）
- 宪法 AR-5/AR-6、AI_SAFETY §5/§7、DoD §1

## Current Repository Facts

- 2026-11-01 起点：`develop` = `origin/develop` = `c01b1e2`，工作树干净；分支 `claude/gap-remediation`。
- 远程 Quality Gates 自 2026-10-20 起连续 13 次 failure；最新 run `40645104801` 仅 Supply Chain Gate 失败（`vulnerabilities=failed, licenses=failed`），其余六项绿色。
- `develop` 保护读回：required contexts = Governance/Static/Node/Browser/Build，`strict`，`enforce_admins`。
- 私有 sibling `../realvirtual-WebViewer-Private~` 不存在；公共 Smart Asset Editor 进入 `editor` 模式并设置活动资产上下文，因此 MCP 编辑器守卫在公共构建放行，桩函数被真实调用。
- 本仓库没有任何 GitHub Actions secret/variable；`deploy-bunny.yml` 原为 `push: main` 触发。

## State Ownership and Compatibility

无持久化格式变化。新增 `security/license-decisions.json`、`security/license-evidence.json`、`security/license-texts/` 仅为门禁输入。MCP 工具的 JSON 结果新增 `unavailable`/`capability` 字段，仅出现在原本空跑的路径；工具名、参数和真实实现路径不变（私有模块不导出标记，行为不变）。

## Allowed Paths

- `package-lock.json`、`security/**`、`scripts/security/**`
- `src/core/rv-public-stub.ts`、`src/private-stubs/**`、`src/plugins/mcp-bridge/**`
- `.github/workflows/deploy-*.yml`
- `tests/security-policy.node.test.ts`、`tests/private-stub-contract.node.test.ts`、`tests/mcp-public-stub-honesty.test.ts`
- `docs/**`（本计划、ADR-0022、安全规范/运维/验收、EP-SEC-001、Harness）

## Forbidden Paths

- `package.json` 的依赖范围（不做 semver-major 升降级）
- `.github/workflows/quality-gates.yml` 的门禁内容

## Milestones

### M1 — 供应链门禁本地转绿

先写失败的策略自检，再实现 ADR-0022；Node 22.22.2/npm 10.9.7 下真实扫描退出 0。

### M2 — 公开 Stub 契约

契约模块与标记；Node 守卫确保所有空桩带标记、真实再导出不带；浏览器测试证明 17 个写/读工具在公共构建中返回 `unavailable` 且文档 opCount 不变，修复前同一测试 20 项失败。

### M3 — 上游流水线与远程强制

部署流水线仅手动；推送后远程 Supply Chain Gate 绿色，再把它加入 `develop`/`main` required checks 并读回。

## Progress

- [x] M1：锁文件非破坏性修复；25 条分诊；18 条许可判定；93 个包 / 25 份补充正文；本地扫描退出 0。
- [x] M2：契约、标记、MCP 检查与测试。
- [x] M3a：两个部署流水线改为 `workflow_dispatch`，并在缺少密钥时明确失败。
- [x] M3b：远程 Supply Chain Gate 绿色 + required check 配置读回（仅 `develop`，按用户 2026-11-01 指令不改 `main`）。

## Surprises & Discoveries

- 桩文件注释称“社区版永远进不到编辑器路径”，与事实不符：公共 Smart Asset Editor 注册了 `editor` 模式。
- `web_editor_*` 的机构工具原拒绝语句把 Agent 引向 `web_editor_create_kinematic`，而后者在公共构建同样是桩，必然失败。
- `select-actions` 桩缺少 `signaturesMatch` 的真实实现，`web_render` 的 `groupBy="geometry"` 在公共构建原会抛 TypeError；现改为结构化拒绝。
- `lovell/sharp-libvips` 在 v1.3.4 标签处的 LICENSE 是 Apache-2.0（构建脚本），而二进制包声明 LGPL-3.0-or-later；补充正文改用包内 README 许可表 + LGPL-3.0/GPL-3.0 规范原文。
- `occt-import-js` 虽是运行时依赖，但公共 `src/` 无导入、公共 `dist/` 无 OCCT 产物（仅私有 STEP 导入使用）。
- 本地 `node_modules` 早于锁文件（缺 `sharp`），导致社区 `tsc` 报 1 个环境错误；`npm ci` 后消失。

## Decision Log

| 日期 | 决定 | 批准依据 |
| --- | --- | --- |
| 2026-11-01 | 执行缺口整改 1–5 步；每步测试通过后提交、推送并开 PR，等远程 CI 后进入下一步 | 用户当前明确指令与 AskUserQuestion 选择“推送分支并开 PR” |
| 2026-11-01 | 采用 ADR-0022 而非扩大全局白名单 | 本计划技术决定，依据 ADR-0019“统一禁用 copyleft 不适用”与“逐项建立证据” |
| 2026-11-01 | 部署流水线改手动而非删除，保留上游维护者可用的路径 | 可逆的最小改动 |
| 2026-11-01 | 每步 CI 通过后合并到 `develop`；required check 只加到 `develop`，`main` 不动 | 用户当前明确指令“后面只要合并到 develop 就行，不需要合并到 main 分支” |

## Validation

本地（macOS arm64，2026-11-01，提交前）：

| 验证 | 实际结果 |
| --- | --- |
| `./scripts/verify.sh governance` | 通过（离线帮助因 `SECURITY_OPERATIONS.md` 输入变化按生成源重新生成） |
| `./scripts/verify.sh static` | 通过（Lint、架构边界、社区 TypeScript） |
| `./scripts/verify.sh node` | 85 文件通过；`tests/appliance-lifecycle.node.test.ts` 7 条失败，原因为 macOS 主机缺少 `systemctl`/`useradd`/`runuser`（Linux 原生安装预检），回退本次锁文件后同样失败，与本计划无关，CI Ubuntu 上为绿色 |
| `./scripts/verify.sh build` | 通过；公共 `dist/` 中无 OCCT 产物（印证 LIC-017） |
| `./scripts/verify.sh browser` | 8 分片 + 性能套件全部通过（共 11,094 条，含新增 22 条）。首轮第 7 片 `tests/real-webgpu-smoke.test.ts` 在本机真实 Metal GPU、可用内存 0.06 GiB 时出现 1 次 GPU 校验错误，单独重跑与整片重跑均通过；该套件在无适配器的 CI 上跳过 |
| `node scripts/security/run-supply-chain.mjs`（Node 22.22.2 / npm 10.9.7） | 退出 0：vulnerabilities=passed、licenses=passed、completeness=passed；判定与补充证据无未使用项 |
| `tests/mcp-public-stub-honesty.test.ts` 反证 | 临时撤回三个 MCP 文件的修改后 20 条失败，恢复后 22 条通过 |

远程结果单独记录，不以本地结果代替。

## Rollback

逐文件可逆：恢复锁文件、清空两个登记文件即回到原红灯；删除 `RV_PUBLIC_STUB` 标记和检查即恢复原空跑行为；把部署流水线的 `on:` 改回原触发条件；在 GitHub 分支保护中移除 `Supply Chain Gate`。

## Outcomes & Retrospective

- 远程：PR [#21](https://github.com/OwnDing/realvirtual-WEB/pull/21) 的 run `41266860571` 七项全部通过（Governance 19 s、Static 1 m 26 s、Node 1 m 38 s、Build 2 m 23 s、Supply Chain 1 m 14 s、Windows browser compatibility 6 m 8 s、Browser 16 m 42 s）。这是 Supply Chain Gate 自 2026-10-20 引入以来首次远程绿色。
- 强制：2026-11-01 通过 GitHub API 把 `Supply Chain Gate` 加入 `develop` required contexts，读回为 Governance/Static/Node/Browser/Build/Supply Chain 六项，`strict=true`、`enforce_admins=true`、禁止强推与删除。`main` 保护未改。
- 合并：2026-11-01T03:15:50Z 合入 `develop`，merge commit `d9c2e14`。
- 偏差：push 被仓库 `.claude/settings.json` 的 `git push` deny 规则拦截（AI_SAFETY 纵深防御），由用户手动执行；未绕过。
- 未验证/遗留：A-06/A-07/OD-010 的实际制品履约与法律签收；漏洞分诊到期日 Moderate 2026-12-01、Low 2027-01-30 前必须复评；被桩替代的能力在第 5 步实现。
