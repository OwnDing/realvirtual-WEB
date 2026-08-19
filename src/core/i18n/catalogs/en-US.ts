// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The `en-US` catalog (ADR-0001 §3, §7).
 *
 * EVERY string here was moved VERBATIM out of the source it used to be hardcoded
 * in. That is the whole point of the migration direction the ADR fixes: the
 * English wording is the upstream product's own, it matches the screenshots in
 * `docs/images/`, the root `doc-*.md` files and the existing test assertions, and
 * it must not be re-derived by translating the Chinese back.
 *
 * `scripts/i18n-verbatim-check.mjs` proves that claim mechanically against the
 * pre-migration sources in git, and `tests/i18n-catalog.node.test.ts` fails if a
 * value here drifts from what the code used to say.
 *
 * Going forward `zh-CN` is the source: a NEW string is authored there first and
 * mirrored here. This file is never the place a new product wording is invented.
 */

export const enUS = {
  common: {
    open: 'Open',
    cancel: 'Cancel',
    delete: 'Delete',
    duplicate: 'Duplicate',
    rename: 'Rename…',
    refresh: 'Refresh',
    remove: 'Remove',
  },
  preboot: {
    loading: 'Loading ',
    slogan: 'Open. Light. Industrial. Anywhere.',
    errorTitle: 'Could not load the model',
    retry: 'Retry',
    reloadPage: 'Reload page',
    retrying: 'Connection problem — retrying ({{attempt}}/{{total}})…',
    preparingScene: 'Preparing scene…',
    restoreTitle: 'Restore last scene?',
  },
  plugins: {
    annotate: 'Annotate',
  },
  viewer: {
    badgeError: 'Error',
  },
  projects: {
    title: 'Projects',
    shell: {
      backToProjects: 'Back to projects',
      closeEsc: 'Close (Esc)',
      closeProjects: 'Close Projects',
      search: 'Search…',
    },
    tree: {
      label: 'Project tree',
      collapse: 'Collapse',
      expand: 'Expand',
      folderContents: 'Folder contents',
      cardSize: 'Card size',
    },
    filter: {
      groupLabel: 'Filter documents',
      tagPlaceholder: '# tag',
      all: 'All',
    },
    classification: {
      title: 'Classification',
      addTag: 'Add tag…',
    },
    assetPrompt: {
      collectionsHint: 'Comma-separated. Leave empty to remove this asset from all collections.',
      fileName: 'File name',
      collections: 'Collections',
      sceneName: 'Scene name',
    },
    transfer: {
      targetsLabel: 'Transfer targets',
      noTargets: 'No other writable project is open. Add a workspace folder, or open a project folder, to have somewhere to send this to.',
      moveNote: '"{{name}}" moves into the target\'s library; the original goes to the source project’s trash.',
      copyNote: '"{{name}}" is copied into the target\'s library as a new document.',
    },
    list: {
      fixedProject: 'This deployment opens a single fixed project.',
      noWorkspaceTitle: 'No workspace selected',
      // `<0>` is the `project.json` code span. Keeping it inside ONE key rather
      // than three JSX fragments is what lets a translator move it in the
      // sentence; three fragments would freeze English word order.
      noWorkspaceHelp: 'A workspace is one folder that holds your projects. Every direct subfolder with a <0>project.json</0> shows up here.',
      openWorkspace: 'Open workspace…',
      openSingleFolder: 'or open a single project folder…',
      workspacePrefix: 'Workspace: {{name}}',
      noWorkspaceShort: 'No workspace selected.',
      empty: 'This workspace has no projects yet.',
      removeFromRecent: 'Remove from Recent',
      removeNamedFromRecent: 'Remove {{name}} from Recent',
      actionsFor: 'Project actions for {{name}}',
      rename: 'Rename…',
      delete: 'Delete…',
    },
    demoCaption: 'realvirtual demo scenes & library',
    nav: {
      project: 'Project',
      libraries: 'Libraries',
      openEllipsis: 'Open…',
      newProject: 'New project',
    },
    detail: {
      modified: 'Modified',
      nothingSelected: 'Nothing selected',
      actions: 'Actions',
      nothingOpen: 'Nothing open — double-click an asset to start.',
      project: 'Project',
      source: 'Source',
      category: 'Category',
      collections: 'Collections',
      footprint: 'Footprint',
      tags: 'Tags',
    },
    action: {
      open: 'Open',
      edit: 'Edit',
      editCopy: 'Edit a copy',
      duplicate: 'Duplicate',
      duplicateToProject: 'Duplicate to this project',
      delete: 'Delete',
      collections: 'Collections…',
      copyTo: 'Copy to…',
      moveTo: 'Move to…',
      rename: 'Rename…',
      newFolder: 'New Folder',
      closeProject: 'Close Project',
      cancel: 'Cancel',
      exportProject: 'Export .rvproject',
      importProject: 'Import .rvproject…',
      addLibrary: 'Add library',
      refreshLibrary: 'Refresh library',
      removeLibrary: 'Remove library',
      projectActions: 'Project actions',
      newDocument: 'New document',
      refreshSource: 'Refresh {{source}}',
      removeSource: 'Remove {{source}}',
      newDocumentIn: 'New document in {{target}}',
      projectRoot: 'the project root',
      saveTransient: 'This scene came from a link and is not stored anywhere yet — saving keeps it under My scenes.',
      saveUnderNewName: 'Save the current edits under a new name.',
    },
    confirm: {
      deleteAssetTitle: 'Delete asset',
      deleteAssetMessage: 'Delete "{{name}}"? It is moved to the project\'s trash folder.',
      deleteProjectTitle: 'Delete project',
      deleteProjectMessage: 'Delete the project "{{name}}" and its folder "{{folder}}"? This cannot be undone.',
      deleteSceneTitle: 'Delete scene',
      deleteSceneMessage: 'Delete the scene "{{name}}"? This cannot be undone.',
      removeLibraryTitle: 'Remove library',
      removeLibraryMessage: 'Remove the library "{{name}}" from this viewer? Its files are not deleted.',
    },
    error: {
      assetNotRegistered: '"{{name}}" is not registered in this project — reopen the project and try again.',
      projectCreatedNotOpened: 'The project was created but could not be opened.',
      onlyFolderExport: 'Only a project folder can be exported.',
      readOnly: 'This project is read-only.',
      projectGone: 'That project is no longer in the workspace.',
      documentGone: 'That document is no longer part of this project.',
      workspaceInaccessible: 'The workspace folder is not accessible.',
      noWorkspace: 'No workspace folder is open — pick one first.',
      catalogRestructure: 'A catalog cannot be restructured from here.',
      libraryNoFolders: 'A library cannot hold new folders.',
      projectOpenFailed: 'That project could not be opened.',
      closeBeforeDelete: 'Close the project before deleting it.',
      verbFailed: '{{verb}} failed: {{detail}}',
      verbFailedShort: '{{verb}} failed.',
    },
    status: {
      exported: 'Exported {{count}} files. Caches and secrets were excluded.',
      imported: 'Imported "{{name}}" ({{count}} files).',
      moved: '"{{name}}" moved to "{{target}}".',
      copied: '"{{name}}" copied to "{{target}}".',
      movedRepointed: 'Moved, and repointed {{count}} document link(s).',
      renameRefusedPath: 'Rename refused: "{{path}}" is not part of this project\'s tree.',
      renameRefused: 'Rename refused: {{reason}}.',
    },
    verb: {
      newProject: 'New project',
      exportProject: 'Export project',
      deleteAsset: 'Delete asset',
      duplicateAsset: 'Duplicate asset',
      deleteProject: 'Delete project',
      moveDocument: 'Move document',
      openProject: 'Open project',
      removeLibrary: 'Remove library',
      open: 'Open',
      rename: 'Rename',
      renameProject: 'Rename project',
      refreshLibrary: 'Refresh library',
      newFolder: 'New folder',
      newDocument: 'New document',
      importProject: 'Import project',
      duplicateScene: 'Duplicate scene',
      deleteScene: 'Delete scene',
      closeProject: 'Close project',
      classifyDocument: 'Classify document',
      setCollections: 'Set collections',
      copyDocument: 'Copy document',
    },
  },
} as const;
