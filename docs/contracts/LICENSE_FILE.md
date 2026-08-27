---
doc_id: CONTRACT-LICENSE-FILE-001
title: 许可证文件契约 v1
status: approved
owner: architecture
last_reviewed: 2026-08-27
authority: normative
---

# CONTRACT-LICENSE-FILE-001：许可证文件契约 v1

本契约定义 `.rvlic` 许可证文件的字节格式、签名构造、验证顺序与状态判定。机器可读部分见 [`../../schema/v1/license-file.json`](../../schema/v1/license-file.json)。决策依据见 Accepted [`ADR-0007`](../adr/ADR-0007-offline-license-evidence.md)。

**定位（规范性）**：本文件描述的是**合同凭证与防篡改审计记录**，不是访问控制机制。签名保证「这份许可证确实由本项目签发、内容未被改动」；它不保证、也不试图保证任何人无法绕过校验。本项目为 AGPL-3.0-only，被授权方持有完整源码并有权修改（`LICENSE:376`）。

## 1. 载体与加载

| 项 | 规则 |
| --- | --- |
| 路径 | 由部署配置 `license.path` 指定，默认 `license.rvlic`，相对 `import.meta.env.BASE_URL` 解析 |
| 来源 | **必须同源**。`path` 经 `relativeAssetUrl()` 校验，拒绝任何 scheme 与协议相对 `//` |
| 外呼 | **零**。同源请求在 `decideEgress` 中于 allowlist 之前返回 `same-origin`，不需要 `EgressPurpose` |
| 大小 | 响应体 **≤ 16 KiB**。超限即拒绝，且**不进行 Base64 解码** |
| 编码 | UTF-8 JSON |
| 失败 | **失败关闭到 `absent` 状态**。不得复用 `settings.json` 的失败即开语义 |

## 2. 信封

    {
      "rvlic": 1,
      "payload": "<严格标准 Base64：载荷 UTF-8 字节>",
      "sig":     "<严格标准 Base64：64 字节 Ed25519 签名>",
      "cert":    { "pub": "<43 字符+=>", "org": "<字符串>", "sig": "<86 字符+==>" }
    }

- `rvlic` 必须为 `1`。其它值 → `invalid`。
- `cert` 可选。缺省时 `sig` 由编译进包的根公钥验证；存在时先用根公钥验证 `cert.sig`，再用 `cert.pub` 验证 `sig`。
- 信封**不允许**未知顶层字段（`additionalProperties: false`）。载荷**允许**未知字段（见 §4）。

**严格 Base64**：除正则匹配外，实现**必须**将解码结果重新编码并与原串逐字符比对，不等则拒绝。这拒绝非规范编码，消除签名可塑性。

## 3. 签名构造

许可证签名消息：

    "RV-LIC-V1" ‖ u32LE(payloadBytes.length) ‖ payloadBytes

委托证书签名消息（与 `rv-sig-verify.ts:251-260` 的 RV-KEY-V1 逐字节一致）：

    "RV-KEY-V1" ‖ pub(32 字节) ‖ u32LE(orgUtf8.length) ‖ orgUtf8

`org` 在编码前按 **NFC** 规范化。前缀均为 ASCII，不含分隔符和长度以外的内容。

**域分隔是规范性要求**：前缀与长度前缀共同保证一份许可证签名不可能被当作 GLB 文件签名或委托证书使用，反之亦然。实现不得省略任一部分。

**签名覆盖的是 `payload` 解码后的字节**，不是 JSON 值。因此不存在键序、重复键、Unicode 规范化或空白差异问题；实现**不得**为验签而重新序列化载荷。

## 4. 载荷

    {
      "v": 1,
      "id": "XYV-LIC-2026-0001",
      "issuedAt": "2026-08-27T00:00:00Z",
      "notAfter": "2027-08-27T00:00:00Z",
      "graceDays": 30,
      "customer": { "org": "...", "contact": "..." },
      "binding":  { "installId": "XYV-INST-9F2A4C81", "hosts": ["hmi.plant.example.com"] },
      "features": ["planner", "des", "smart-asset-editor"],
      "limits":   { "seats": 25, "signals": 5000 },
      "terms":    { "url": "...", "version": "2026-08" }
    }

| 字段 | 必需 | 规则 |
| --- | --- | --- |
| `v` | 是 | 必须为 `1` |
| `id` | 是 | 稳定许可证标识，1–128 字符，出现在审计记录与支持工单中 |
| `issuedAt` | 是 | RFC 3339 UTC，字面 `Z`。**同时是时钟下界**（§6） |
| `notAfter` | 是 | RFC 3339 UTC，字面 `Z` |
| `graceDays` | 否 | 整数。缺省 **30**。超出 `[0, 180]` **钳制**而非拒绝 |
| `customer` | 否 | 展示与审计用 |
| `binding` | 否 | 见 §5。缺省表示不绑定 |
| `features` | 否 | 稳定功能 ID。**未知 ID 忽略，不构成错误** |
| `limits` | 否 | 见 §7 |
| `terms` | 否 | 合同条款 URL 与版本 |

**只加不减**：载荷允许未知字段并**必须保留**它们。旧客户端遇到新字段忽略即可，不得因此判为 `invalid`。新增字段一律可选。

本 v1 **不含** `notBefore`。预先签发未来生效的许可证不在 v1 范围内；确有需要时按只加不减规则追加，不改变现有字段语义。

## 5. 绑定

`binding.installId` 与 `binding.hosts` **两个维度都比对**，任一不符即进入 `mismatch`。

| 维度 | 比对对象 | 规则 |
| --- | --- | --- |
| `installId` | 部署配置 `license.installId` | 精确相等。配置侧缺失即视为不符 |
| `hosts` | `window.location.hostname` | 小写比较；单层 `*.` 通配恰好消费一个标签（`*.a.com` 匹配 `x.a.com`，不匹配 `a.com`，不匹配 `x.y.a.com`）；回环名**只有显式列出**才匹配 |

**规范性声明**：两者都是**自述值**。`settings.json` 由客户托管、未签名，且解析失败即返回 `{}`（`rv-app-config.ts:244-259`）；主机名由托管方决定。因此绑定的作用是**在审计时出示「许可证声明它签发给 X，而这台机器自称是 Y」**——签名保证前半句不可伪造，这是凭证系统能提供的全部。

`mismatch` **不得**降低任何能力，只产生说明性提示。绑定不符在现场压倒性地是正当运维事件（迁移主机名、从备份恢复）。

## 6. 时间

    effectiveNow = max(Date.now(), 持久化高水位, Date.parse(issuedAt))

三个下界的作用：`Date.now()` 是正常情况；`issuedAt` 零成本且不可清除——许可证不可能在签发前运行，因此把时钟拨到 1970 只会读出签发日；高水位是尽力而为的补充，随浏览器 profile、隐私模式与清缓存丢失，**不得**作为依赖项。

时钟回拨（`Date.now()` 显著低于高水位）产生 `clockRollback` 诊断，进入审计记录与提示文案，**不得**降低可用性。

## 7. 上限

`limits.seats` 与 `limits.signals` 是**合同条款**，记录并展示，**不得**作为拒绝依据。

浏览器无法观察其它浏览器，因此席位数在客户端不可验证。信号数只做本地读数展示（「本部署当前 N / 合同 M」），`SignalStore.register()` 不得因此新增拒绝路径。把不可执行的上限实现成"强制"是虚假承诺。

## 8. 部署配置

部署配置新增 `license` 段（走 Deployment Config v1 根部 `additionalProperties: true`）：

    "license": {
      "required": true,
      "path": "license.rvlic",
      "installId": "XYV-INST-9F2A4C81"
    }

| 字段 | 缺省 | 规则 |
| --- | --- | --- |
| `required` | `false` | **`false` 时授权子系统完全不启用**，不加载文件、不显示任何授权文案 |
| `path` | `license.rvlic` | 经 `relativeAssetUrl()` 校验，锁死同源 |
| `installId` | 无 | 自述安装标识，仅用于 §5 比对 |

`required` 缺省为 `false` 是规范性要求：缺少它会让「文件缺失」与「这份部署本来就不需要许可证」塌缩成同一状态，导致公共演示、社区构建与开发检出显示未授权文案。

解析函数**必须幂等**——部署配置在每次启动被校验两次（`rv-app-config.ts:255` 与 `:213-215`）。

## 9. 判定顺序（规范性）

实现必须按此顺序求值，先命中先返回：

1. `license.required !== true` → **`not-required`**
2. 加载失败、404、超过 16 KiB → **`absent`**
3. 信封非法、`rvlic !== 1`、Base64 非规范 → **`invalid`**
4. Ed25519 两条路径都不可用 → **`unverifiable`**
5. 签名验证失败（含 `cert` 链任一环） → **`invalid`**
6. 载荷 `JSON.parse` 失败、`v !== 1`、必需字段缺失或格式非法 → **`invalid`**
7. 绑定不符 → **`mismatch`**
8. `effectiveNow ≤ notAfter − 30 天` → **`valid`**
9. `effectiveNow ≤ notAfter` → **`expiring`**
10. `effectiveNow ≤ notAfter + graceDays` → **`grace`**
11. 其余 → **`readonly`**

## 10. 状态与行为

| 状态 | 运行 / 信号 / PLC 写 / 报警 / KPI | 创作与保存 | 呈现 |
| --- | --- | --- | --- |
| `not-required` | 全部可用 | 全部可用 | 无任何授权文案 |
| `valid` | 全部可用 | 全部可用 | 设置页一行状态 |
| `expiring` | 全部可用 | 全部可用 | 可关闭提醒，每日再现 |
| `grace` | 全部可用 | 全部可用 | 不可关闭横幅 + 水印 |
| `readonly` | **全部可用** | **保存停用**（带原因） | 不可关闭横幅 + 水印 |
| `mismatch` | 全部可用 | 全部可用 | 说明性横幅 |
| `unverifiable` | 全部可用 | 全部可用 | 同 `grace` 呈现 |
| `invalid` | 全部可用 | 全部可用 | 同 `grace` 呈现 + 明确提示 |
| `absent` | 全部可用 | 全部可用 | 同 `grace` 呈现 + 明确提示 |

**规范性红线**：任何状态下都**不得**阻断 3D 运行、信号接入与刷新、PLC 读写、报警、KPI、趋势、多用户观察，以及打开与查看既有工程。理由是安全而非商务——一个突然无法下发停机指令的 HMI 是安全事故。

`readonly` 的唯一强制点是 `decideSaveVerb`（`src/core/editor/rv-save-document.ts:277`），返回 `verb: 'blocked'` 并附可执行的 `reason`。**不得**使用 `RvDocument.canApply`：它对被拒 op 静默丢弃（`rv-document.ts:365-368`），会造成无声数据丢失。

## 11. 密钥

信任根是编译进包的 32 字节 Ed25519 公钥 `RV_LIC_ROOT_PUBLIC_KEY_BASE64`。私钥只存在于签发环境的 `RV_LIC_SIGN_PRIVATE_KEY`，**不得**进入仓库、构建产物、日志或测试快照。

**不得**复用模型签名的信任根 `RV_SIG_ROOT_PUBLIC_KEY_BASE64`（`src/core/persistence/rv-sig-public-key.ts:10`）——其私钥半边在上游发布密钥中。

轮换：更换签发密钥通过 `cert` 两级结构完成，不需要更换根密钥、不需要发新客户端。更换根密钥需要发新版本客户端。

## 12. 变更规则

本契约按 [`../governance/CHANGE_MANAGEMENT.md`](../governance/CHANGE_MANAGEMENT.md) §3 演进：只加不减，未知字段保留，破坏性变化走「扩展 → 双读 → 切换 → 清理」。`rvlic` 版本号变更需要新 ADR。

§7 与 §10 的"不强制"性质**不得**在后续迭代中被静默改为强制——已签合同的客户会在升级后失去可用性。
