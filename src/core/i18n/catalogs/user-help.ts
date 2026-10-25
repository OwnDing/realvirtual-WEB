// SPDX-License-Identifier: AGPL-3.0-only
export const userHelpChinese = {
  memory: '浏览器导入引擎内存不足。请降低模型精度、拆分装配或使用已配置的转换服务。',
  help: '帮助', open: '查看操作与排障说明（新标签页）', tooltip: '帮助：', ariaStart: '打开帮助：', ariaEnd: '（新标签页）',
  unknown: '操作未完成。请保留当前内容，检查目标状态；若问题持续，请导出诊断包。',
  permission: '浏览器拒绝访问。请确认所选文件夹与权限，再执行操作。',
  quota: '存储空间不足。请先备份项目并释放空间，再检查保存结果。',
  cancelled: '操作已取消。请检查当前内容与目标状态。',
  timeout: '等待超时，结果尚未确认。请先检查目标状态，不要直接重复写入。',
  missing: '所需文件或资源不可用。请检查原文件和引用，再重新打开。',
  network: '资源无法读取。请检查连接、同源资源和部署访问策略。',
  invalid: '文件内容无效或格式不受支持。请检查文件并使用受支持的格式。',
  load: '模型加载未完成。', project: '项目操作未完成。', save: '文档保存未完成。', export: '文件导出未完成。',
};
export const userHelpEnglish: Record<keyof typeof userHelpChinese, string> = {
  memory: 'The browser import engine ran out of memory. Reduce model detail, split the assembly or use your configured conversion service.',
  help: 'Help', open: 'Read instructions and troubleshooting (new tab)', tooltip: 'Help: ', ariaStart: 'Open help for ', ariaEnd: ' (new tab)',
  unknown: 'The operation did not complete. Preserve your work and inspect the target state. Export diagnostics if the problem persists.',
  permission: 'The browser denied access. Check the selected folder and its permissions before proceeding.',
  quota: 'Storage is full. Back up the project and free space, then check the saved result.',
  cancelled: 'The operation was cancelled. Check current content and the target state.',
  timeout: 'The wait timed out and the outcome is unconfirmed. Inspect the target before repeating a write.',
  missing: 'A required file or resource is unavailable. Check the original file and its references before reopening.',
  network: 'The resource could not be read. Check connectivity, same-origin resources and deployment policy.',
  invalid: 'File contents are invalid or unsupported. Check the file and use a supported format.',
  load: 'Model loading did not complete.', project: 'The project operation did not complete.', save: 'Document saving did not complete.', export: 'File export did not complete.',
};
export function userHelpMessages(locale: string) { return locale === 'en-US' ? userHelpEnglish : userHelpChinese; }

/** Core topic labels; plugin-owned labels retain their supplied slug. */
export const chineseHelpTopicLabels: Readonly<Record<string, string>> = {
  '': 'XYvirtual WEB', 'quickstart': '快速上手', 'tours': '离线导览',
  'appearance': '视觉呈现', 'media': '图片与录像', 'support': '诊断与支持', 'projects': '项目与备份',
  'connect/development/ai-clients': 'AI 客户端',
  'connect/development/rest-and-websocket-api': 'REST 与 WebSocket API',
  'connect/getting-started/first-connection': '首次连接',
  'connect/getting-started/installation': 'CONNECT 安装',
  'connect/getting-started/licensing': 'CONNECT 授权',
  'connect/getting-started/viewer-delivery': '查看器交付',
  'connect/interfaces/configuration': '接口与信号', 'connect/interfaces/protocols': '协议',
  'connect/operations/configuration-file': 'CONNECT 配置',
  'connect/operations/remote-access': '远程访问',
  'connect/operations/troubleshooting': '故障排查', 'connect/operations/updates': 'CONNECT 更新',
  'connect/overview': 'CONNECT', 'connect/services/ai-diagnosis': 'CONNECT AI 诊断',
  'connect/services/cad-conversion': 'CAD 转换', 'connect/services/data-recording': '数据记录',
  'des/overview': '离散事件仿真', 'development/overview': '开发', 'editor/overview': '编辑器',
  'getting-started/navigation': '界面导航', 'getting-started/opening-a-twin': '打开数字孪生',
  'hmi/ai-diagnosis': 'AI 诊断', 'hmi/overview': '设备信息系统', 'hmi/signals-and-alarms': '信号与报警',
  'hosting/deployment-options': '部署选项', 'hosting/licensing': '授权', 'odt': 'ODT',
  'planner/overview': '布局规划', 'viewer/interface': '操作界面', 'viewer/scenes-and-models': '场景与模型',
};
