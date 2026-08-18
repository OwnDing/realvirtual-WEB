# realvirtual WEB AI Agent Guide

本文件是仓库级 AI Agent 的短入口，只负责导航和最高优先级规则。详细规则必须维护在 `docs/`，不得继续堆入本文件。

## 1. 项目身份

本项目是开源、浏览器优先的工业数字孪生平台，基于 Three.js、TypeScript、React 和 Vite，目标是在现有 Viewer/HMI/Planner/DES 能力上持续建设：

- 多语言用户界面；
- 可验证、可迁移的分层配置；
- 可复用设备库和拖拽布置；
- 基于稳定端口与约束的设备组装；
- 工业信号接入、仿真、持久化和 AI/MCP 协作。

它不是一个可以随意重写的演示项目。现有 GLB/`rv_extras`、项目文档、插件、信号和持久化兼容性必须被视为产品契约。

## 2. 每个任务的必读顺序

1. 用户当前任务与明确约束；
2. [`docs/governance/DEVELOPMENT_CONSTITUTION.md`](docs/governance/DEVELOPMENT_CONSTITUTION.md)；
3. [`docs/governance/AI_SAFETY.md`](docs/governance/AI_SAFETY.md)；
4. [`docs/governance/DOCUMENT_PRIORITY.md`](docs/governance/DOCUMENT_PRIORITY.md)；
5. [`docs/README.md`](docs/README.md)；
6. 当前任务的 ExecPlan、ADR、产品规格、架构、契约和验收文档；
7. 相关代码、测试，以及 [`docs/LEGACY_DOCUMENT_REGISTER.md`](docs/LEGACY_DOCUMENT_REGISTER.md) 路由到的现有技术文档。

`draft`、`reference`、`snapshot`、`superseded` 文档不得被当作已批准实现依据。现有根目录 `doc-*.md` 默认是待审计参考材料；使用其中结论前必须与代码和测试交叉验证。

## 3. P0 禁止事项

- 不得执行全局进程清理、宽泛递归删除、`git reset --hard`、覆盖用户改动或其他不可恢复操作。
- 未经用户明确要求，不得提交、推送、发布、部署、上传模型或调用外部写接口。
- 不得把 PLC、MQTT、WebSocket、MCP 或调试接口的写操作用于未明确授权的真实设备/生产环境。
- 写操作超时或断连后，不得假设“没有执行”；必须先读回状态再决定是否重试。
- 不得删除、跳过、静音、放宽或伪造测试来使门禁通过。
- 不得用空实现、固定返回、演示数据或隐藏 TODO 冒充完成。
- 不得在未接受 ADR 的情况下改变核心架构、状态所有权、公共契约、持久化格式或技术栈。
- 不得破坏 GLB/`rv_extras`、NodeId、项目文档 ID、资产引用和已保存场景的兼容性。
- 不得手工修改标记为 `generated` 的内容或生成区块；必须修改生成源并重新生成。
- 不得把密钥、令牌、客户模型、生产地址或敏感运行数据写入代码、文档、日志或测试快照。

## 4. 计划与决策

下列任务必须创建或更新 ExecPlan：跨核心模块、用户可见闭环、Schema/持久化/配置变化、工业接口、编辑器与组装语义、性能关键路径、安全边界、跨会话任务。

模板见 [`docs/exec-plans/TEMPLATE.md`](docs/exec-plans/TEMPLATE.md)。影响多个模块或不可逆契约的决定必须使用 [`docs/adr/TEMPLATE.md`](docs/adr/TEMPLATE.md)。遇到 [`docs/governance/OPEN_DECISIONS.md`](docs/governance/OPEN_DECISIONS.md) 中的闸口时，Agent 不得自行拍板。

## 5. 任务相关必读文档

| 变更区域 | 开始前至少阅读 |
| --- | --- |
| 节点路径、重命名、引用 | `doc-node-paths.md`、`schema/v1/specification.md` |
| 项目、文档、保存、草稿、迁移 | `doc-persistence.md` |
| 模型加载、清理、暂停、插件生命周期 | `doc-lifecycle.md` |
| Planner、设备库、拖拽、吸附、组装 | `doc-layout-planner.md` |
| 信号、绑定、PLC 方向与写权限 | `doc-signal-architecture.md`、`doc-signal-connection-logic.md`、`doc-webviewer-interface.md` |
| 插件、UI Slot、可见性 | `doc-extending-webviewer.md`、`doc-ui-visibility.md`、`doc-events-and-hooks.md` |
| MCP/AI 工具 | `doc-ai-integration.md`、`webviewer.mcp.md` |

这些旧文档的治理状态见文档登记表；旧文档与代码不一致时，按文档优先级规则登记漂移，不得静默选择。

## 6. 验证入口

- 文档与治理变更：`./scripts/verify.sh governance`
- 常规静态检查：`./scripts/verify.sh static`
- Node 测试：`./scripts/verify.sh node`
- 浏览器单元/集成测试：`./scripts/verify.sh browser`
- 构建：`./scripts/verify.sh build`
- 综合交付门禁：`./scripts/verify.sh all`
- 关键用户流程：按 ExecPlan 运行 `./scripts/verify.sh e2e` 或更窄的 Playwright 场景。

Harness 不安装依赖、不修改锁文件，也不替代真实设备、真实 PLC、浏览器兼容性或人工 UX 验收。

## 7. 完成要求

任务只有同时满足以下条件才可报告完成：

- 范围内正例、反例和错误行为可观察；
- 适用的类型、Lint、测试、构建、浏览器或运行时验证通过；
- 公共契约、Schema、生成物、文档和 ExecPlan 同步；
- 未验证的真实设备、生产连接、浏览器或性能结论被明确披露；
- 最终报告列出变更、验证、偏差、风险和回滚方式。

详细要求见 [`docs/governance/DEFINITION_OF_DONE.md`](docs/governance/DEFINITION_OF_DONE.md)。
