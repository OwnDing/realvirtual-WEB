// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The `zh-CN` catalog — the source catalog and the final fallback (ADR-0001 §3).
 *
 * Two consequences follow from "source", and both are load-bearing:
 *
 *  1. It is complete by construction. A key that exists anywhere must exist here,
 *     which is what makes `fallbackLng: 'zh-CN'` a real safety net rather than a
 *     second chance to be missing. `tests/i18n-catalog.node.test.ts` enforces it.
 *  2. A NEW string is authored here first, and mirrored into `en-US`. The
 *     opposite direction only ever ran once, for the initial migration of the
 *     upstream English, and it must not be re-run over existing wording.
 *
 * Industrial units, signal names, PLC family names and stable IDs are not
 * translated (PS-I18N-001 §2, ADR-0001 §6) and therefore never appear here.
 */

export const zhCN = {
  common: {
    open: '打开',
    delete: '删除',
    duplicate: '创建副本',
    rename: '重命名…',
    refresh: '刷新',
    remove: '移除',
  },
  preboot: {
    loading: '正在加载 ',
    slogan: '开放、轻量、工业级、随处可用。',
    errorTitle: '无法加载模型',
    retry: '重试',
    reloadPage: '重新加载页面',
    retrying: '连接异常 — 正在重试（{{attempt}}/{{total}}）…',
    preparingScene: '正在准备场景…',
    restoreTitle: '恢复上次的场景？',
  },
  plugins: {
    annotate: '添加批注',
  },
  viewer: {
    badgeError: '错误',
  },
  projects: {
    title: '项目',
    demoCaption: 'realvirtual 演示场景与库',
    nav: {
      project: '项目',
      libraries: '库',
      openEllipsis: '打开…',
      newProject: '新建项目',
    },
    detail: {
      modified: '修改时间',
      project: '项目',
      source: '来源',
      category: '类别',
      collections: '集合',
      footprint: '占地尺寸',
      tags: '标签',
    },
    action: {
      open: '打开',
      edit: '编辑',
      editCopy: '编辑副本',
      duplicate: '创建副本',
      duplicateToProject: '复制到本项目',
      delete: '删除',
      collections: '集合…',
      copyTo: '复制到…',
      moveTo: '移动到…',
      rename: '重命名…',
      newFolder: '新建文件夹',
      closeProject: '关闭项目',
      exportProject: '导出 .rvproject',
      importProject: '导入 .rvproject…',
      addLibrary: '添加库',
      refreshLibrary: '刷新库',
      removeLibrary: '移除库',
      projectActions: '项目操作',
      newDocument: '新建文档',
      refreshSource: '刷新 {{source}}',
      removeSource: '移除 {{source}}',
      newDocumentIn: '在 {{target}} 中新建文档',
      projectRoot: '项目根目录',
      saveTransient: '该场景来自链接，尚未存储在任何位置 — 保存后会放入“我的场景”。',
      saveUnderNewName: '以新名称保存当前修改。',
    },
    confirm: {
      deleteAssetTitle: '删除资产',
      deleteAssetMessage: '删除“{{name}}”？它会被移入项目的回收站文件夹。',
      deleteProjectTitle: '删除项目',
      deleteProjectMessage: '删除项目“{{name}}”及其文件夹“{{folder}}”？此操作无法撤销。',
      deleteSceneTitle: '删除场景',
      deleteSceneMessage: '删除场景“{{name}}”？此操作无法撤销。',
      removeLibraryTitle: '移除库',
      removeLibraryMessage: '从本查看器移除库“{{name}}”？其文件不会被删除。',
    },
    error: {
      assetNotRegistered: '“{{name}}”未登记在本项目中 — 请重新打开项目后重试。',
      projectCreatedNotOpened: '项目已创建，但无法打开。',
      onlyFolderExport: '只有项目文件夹可以导出。',
      readOnly: '本项目为只读。',
      projectGone: '该项目已不在工作区中。',
      documentGone: '该文档已不属于本项目。',
      workspaceInaccessible: '无法访问工作区文件夹。',
      noWorkspace: '尚未打开工作区文件夹 — 请先选择一个。',
      catalogRestructure: '无法从此处调整目录结构。',
      libraryNoFolders: '库中不能新建文件夹。',
      projectOpenFailed: '该项目无法打开。',
      closeBeforeDelete: '请先关闭项目再删除。',
      verbFailed: '{{verb}}失败：{{detail}}',
      verbFailedShort: '{{verb}}失败。',
    },
    status: {
      exported: '已导出 {{count}} 个文件。缓存和密钥已排除。',
      imported: '已导入“{{name}}”（{{count}} 个文件）。',
      moved: '“{{name}}”已移动到“{{target}}”。',
      copied: '“{{name}}”已复制到“{{target}}”。',
      movedRepointed: '已移动，并重新指向 {{count}} 个文档链接。',
      renameRefusedPath: '重命名被拒绝：“{{path}}”不属于本项目的目录树。',
      renameRefused: '重命名被拒绝：{{reason}}。',
    },
    verb: {
      newProject: '新建项目',
      exportProject: '导出项目',
      deleteAsset: '删除资产',
      duplicateAsset: '创建资产副本',
      deleteProject: '删除项目',
      moveDocument: '移动文档',
      openProject: '打开项目',
      removeLibrary: '移除库',
      open: '打开',
      rename: '重命名',
      renameProject: '重命名项目',
      refreshLibrary: '刷新库',
      newFolder: '新建文件夹',
      newDocument: '新建文档',
      importProject: '导入项目',
      duplicateScene: '创建场景副本',
      deleteScene: '删除场景',
      closeProject: '关闭项目',
      classifyDocument: '分类文档',
      setCollections: '设置集合',
      copyDocument: '复制文档',
    },
  },
} as const;
