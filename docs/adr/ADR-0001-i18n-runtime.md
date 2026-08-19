---
doc_id: ADR-0001
title: 选择 i18next 多语言运行时与静态目录架构
status: draft
adr_status: proposed
owner: architecture
last_reviewed: 2026-08-19
authority: proposed
---

# ADR-0001：选择 i18next 多语言运行时与静态目录架构

## Context

Approved `PS-I18N-001` 要求首批支持 `zh-CN`/`en-US`、默认中文、中文最终回退、用户偏好持久化和 AI 直接翻译。语言偏好属于用户/浏览器状态，不得写入 GLB 或共享项目文档。

当前项目使用 React 19.2、MUI 7.3、TypeScript 5.7 和 Vite 6；UI 同时包含 React 组件、非 React 插件/管理器和多个独立 React Root。仓库没有正式 i18n 依赖，`src/plugins/snap-point/strings.ts` 只是单功能英文字符串表。

2026-08-19 现场查询的候选版本为 i18next 26.3.6、react-i18next 17.0.11 和 react-intl 10.1.22；前两者的 peer 范围覆盖当前 React/TypeScript，实际实施仍必须由 lockfile 固定版本并重新验证。官方资料确认 i18next 可直接绑定静态 `resources`、配置 `fallbackLng` 和类型化资源，react-i18next 提供 Hook/Context 与语言切换能力：

- [i18next configuration options](https://www.i18next.com/overview/configuration-options)
- [i18next fallback](https://www.i18next.com/principles/fallback)
- [i18next TypeScript](https://www.i18next.com/overview/typescript)
- [react-i18next useTranslation](https://react.i18next.com/latest/usetranslation-hook)

## Decision

若本 ADR 被接受：

1. 使用 `i18next` 作为框架无关核心，使用 `react-i18next` 连接 React；非 React 插件和管理器通过窄封装调用同一实例，不直接依赖 React Context。
2. `zh-CN` 和 `en-US` 目录随公共构建静态打包；黄金切片不引入 HTTP backend、浏览器语言探测插件或运行时远程目录。
3. `zh-CN` 是默认语言、产品源文案和 `fallbackLng`；英文目录缺 key 时回退中文，中文仍缺失时返回稳定 key 并向可测试的诊断入口报告。
4. 翻译 key 与显示文本解耦，按领域 namespace 组织；TypeScript 资源类型和严格 key 检查在黄金切片中失败关闭。
5. 用户选择存入版本化 `localStorage` key，并登记到 `rv-storage-keys.ts`；存储不可用或值无效时使用内存态 `zh-CN`，不得污染项目、文档或 GLB。
6. 日期和数字使用浏览器原生 `Intl.DateTimeFormat`/`Intl.NumberFormat` 并显式传入当前 locale；工业单位、信号名称和稳定 ID 不本地化。
7. AI 在开发流程中直接生成并维护 `en-US` 静态目录，不要求人工翻译或语言复核；目录合入前必须通过 key、占位符、标记、空值、漂移和 Browser 行为门禁。
8. 浏览器运行时不得调用 AI 或第三方翻译服务，不得需要翻译令牌，不把网络可用性加入启动和语言切换关键路径。

## Alternatives

### React Intl / FormatJS

优点是 ICU MessageFormat、日期数字组件和消息提取体系完整，也提供 React 与 imperative API。未作为首选，因为当前仓库大量文本位于非 React 插件/管理器，中文静态源目录与 AI 派生目录更适合资源表和 namespace 迁移；React Intl 的 inline `defaultMessage`/提取工作流会增加第一阶段迁移面。若未来复杂复数、性别或 ICU 文案成为主要需求，可用新 ADR 重新评估。

### 自研字符串 Store

可以维持极小依赖并贴合现有 `snap-point/strings.ts`，但需要自行实现 namespace、回退、插值、React 订阅、严格 key 类型和生态工具，长期成本及漂移风险高于采用成熟核心。

### 浏览器运行时 AI 翻译

拒绝。它引入非确定输出、延迟、离线失败、密钥和源文案外发风险，也无法保证同一提交产生可复现界面；与 Approved 产品规格的静态、可测试目录责任冲突。

## Consequences

- 新增两个 MIT 依赖，并增加少量运行时和包体积；实施前后必须记录锁定版本和入口 chunk 变化。
- 同一个 i18next 实例可服务 React Hook、独立 Root 和非 React 插件，但必须由核心 i18n 模块拥有初始化和生命周期，禁止各插件创建隐式实例。
- 静态目录保证离线和确定性，代价是每次中文源文案变化都需要 AI 同步英文并通过漂移检查。
- 第一阶段只迁移黄金切片；KD-001 在全仓增量迁移完成前保持 open。

## Compatibility and Migration

- 新增语言偏好没有旧 Schema 或项目迁移；缺少/损坏偏好值一律回退 `zh-CN`。
- 现有 GLB、rv-ODT、NodeId、项目文档、插件 ID 和工业信号保持不变。
- 现有局部字符串表先由适配层兼容，只有在对应 UI 纳入迁移范围并有回归测试时才移除。
- “Reset all” 必须清除语言偏好；storage registry、清理测试和隐私模式反例同步更新。

## Validation

- dependency license/peer/lockfile 与公共 AGPL build 检查；
- locale 归一化、默认值、无效存储、存储不可用和回退链 Node 测试；
- key 集合、占位符、标记、空值、源目录漂移和 AI 目标目录漂移检查；
- React Hook、非 React `t()`、多个 Root 同步切换的 Browser 测试；
- 默认中文、切换英文、刷新恢复、缺 key、保存/重载项目和 Reset all 黄金切片；
- static、node、browser、build 和入口包体积基线。

## Rollback or Supersession

黄金切片可回退到原硬编码文案，同时移除新增偏好 key 和依赖；不涉及项目数据迁移。回退不能删除字符串盘点或 KD-001 证据。未来替换框架必须通过新 ADR，证明目录、key、偏好和回退行为兼容或提供版本化迁移。
