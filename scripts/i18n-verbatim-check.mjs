// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Proof that the English catalog was MOVED, not rewritten (ADR-0001 §3, §7).
 *
 * The ADR fixes the migration direction: the upstream English wording goes into
 * `en-US` verbatim, and `zh-CN` is translated FROM it. The failure mode that
 * makes worth guarding against is silent and expensive — an English string
 * re-derived by translating the Chinese back reads fine in review, matches no
 * screenshot in `docs/images/`, no wording in the root `doc-*.md` files, and no
 * existing test assertion, and nobody can tell afterwards which strings drifted.
 *
 * So the check is mechanical: every `en-US` value must still be findable, word
 * for word, in the PRE-MIGRATION source. Interpolation is the one allowance —
 * `Refresh {{source}}` has to match the template literal `Refresh ${src.label}`
 * it replaced — so a `{{name}}` matches any run of characters and nothing else
 * is relaxed.
 *
 *   node scripts/i18n-verbatim-check.mjs [--ref <git-ref>]
 *
 * Exit 0 = every value traces back. Exit 1 = at least one does not, listed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The commit the migration started from.
 *
 * Pinned rather than "HEAD~1": the baseline is a FACT about when the strings
 * were extracted, and a moving ref would quietly re-baseline the check the first
 * time somebody edits an English value and commits it.
 */
export const MIGRATION_BASE_REF = 'd1949a5';

/** Files the golden slice took its English from. */
export const MIGRATED_SOURCES = [
  // Golden slice (Milestone 3)
  'src/core/hmi/projects/ProjectsDashboardHost.tsx',
  'src/core/engine/rv-error-visual.ts',
  'src/plugins/annotation-plugin.ts',
  'src/main.ts',
  'index.html',
  // Rest of the Projects flow (Milestone 4, batch 1)
  'src/core/hmi/projects/ProjectsList.tsx',
  'src/core/hmi/projects/ProjectsDashboard.tsx',
  'src/core/hmi/projects/ProjectsDetailPane.tsx',
  'src/core/hmi/projects/DocumentHeroSection.tsx',
  'src/core/hmi/projects/DocumentFilterBar.tsx',
  'src/core/hmi/projects/ProjectTree.tsx',
  'src/core/hmi/projects/ProjectFolderContents.tsx',
  'src/core/hmi/projects/ClassificationEditor.tsx',
  'src/core/hmi/projects/AssetPromptDialog.tsx',
  'src/core/hmi/projects/SceneNameDialog.tsx',
  'src/core/hmi/projects/TransferTargetDialog.tsx',
  'src/core/hmi/projects/DestructiveConfirmDialog.tsx',
  'src/core/hmi/projects/document-filter.ts',
  'src/core/hmi/ConfirmActionDialog.tsx',
  // Settings panel (Milestone 4b, batch 2)
  'src/core/hmi/SettingsPanel.tsx',
  'src/core/hmi/settings/ModelTab.tsx',
  'src/core/hmi/settings/WorkfolderMigrationSection.tsx',
  'src/core/hmi/settings/MouseTab.tsx',
  'src/core/hmi/settings/VisualTab.tsx',
  'src/core/hmi/settings/SimulationTab.tsx',
  'src/core/hmi/settings/InterfacesTab.tsx',
  'src/core/hmi/settings/MultiuserTab.tsx',
  'src/core/hmi/settings/McpTab.tsx',
  'src/core/hmi/settings/RagStatusSection.tsx',
  'src/core/hmi/settings/rag-status.ts',
  'src/core/hmi/settings/DevToolsTab.tsx',
  'src/core/hmi/settings/TestsTab.tsx',
  'src/core/hmi/settings/GroupsTab.tsx',
  'src/core/hmi/settings/CameraStartTab.tsx',
  'src/core/rv-render-modes.ts',
  'src/plugins/camera-startpos-plugin.tsx',
];

/**
 * Keys the base ref cannot contain verbatim, each with a reason.
 *
 * What ADR-0001 §3 forbids is re-deriving English WORDING. Restructuring how a
 * sentence is assembled is a different thing and sometimes unavoidable, but it
 * still has to be declared here rather than waved through by loosening the
 * matcher — that way the exceptions stay countable and reviewable.
 */
const PLURAL_SPLICE = 'English plural inflection spliced into the expression, not into words: '
  + 'the source wrote `entr${n === 1 ? "y" : "ies"}` / `object${n !== 1 ? "s" : ""}`, so neither '
  + 'inflected form exists as a run of characters anywhere. i18next resolves `_one`/`_other` '
  + 'per language instead, which is also the only shape zh-CN (one form) and en-US (two) can share. '
  + 'Same words, different seam.';

const CAPITALISED_AT_RENDER = 'Produced by `id.charAt(0).toUpperCase() + id.slice(1)` over the '
  + 'option id, so the capitalised word was never in the source text — only the lowercase id was. '
  + 'Moving the capitalisation into the catalog is what lets the label be translated at all.';

export const NEW_STRING_EXEMPTIONS = new Map([
  ['projects.status.moved', 'Sentence-frame split. The source built one string with the verb interpolated '
    + '(`"${doc.name}" ${mode === "move" ? "moved" : "copied"} to "${ws.name}".`), which hands a '
    + 'translator a frame they cannot inflect. The English words are unchanged; only the seam moved.'],
  ['projects.status.copied', 'The other half of the same split — see `projects.status.moved`.'],
  ['settings.backup.clearLegacyConfirm_one', PLURAL_SPLICE],
  ['settings.backup.clearLegacyConfirm_other', PLURAL_SPLICE],
  ['settings.groups.objectCount_other', PLURAL_SPLICE],
  ['settings.cameraStart.savedUserAt', 'The date suffix was a template literal NESTED inside another '
    + '(`Saved (user)${savedAt ? ` — ${…}` : ""}`), so "Saved (user) — " never existed as one run of '
    + 'characters. Both halves are unchanged; joining them is what makes the line one translatable '
    + 'sentence instead of two fragments a translator cannot reorder.'],
  ['settings.visual.toneMapping.option.linear', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.reinhard', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.cineon', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.neutral', CAPITALISED_AT_RENDER],
  ['settings.visual.lighting.quality.medium', CAPITALISED_AT_RENDER],
]);

function flatten(node, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value, path));
    else out[path] = String(value);
  }
  return out;
}

/** The pre-migration text of every migrated source, concatenated. */
export function readBaseSources(ref = MIGRATION_BASE_REF, root = ROOT) {
  return MIGRATED_SOURCES.map((path) => {
    try {
      return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' });
    } catch {
      return ''; // A file that did not exist then cannot have contributed strings.
    }
  }).join('\n');
}

/**
 * A matcher for one catalog value.
 *
 * Three, and only three, differences are tolerated — each one a mechanical
 * consequence of moving a string out of JSX rather than a change of wording:
 *
 *   - `{{name}}` spans the `${…}` expression it replaced;
 *   - `<0>`/`</0>` span the JSX element they replaced (a `<code>` span, say),
 *     since a `<Trans>` key numbers its children instead of naming them;
 *   - a run of spaces matches any whitespace OR one of the three things that
 *     RENDER as whitespace but are not: a JavaScript concatenation seam
 *     (`' + '` or a backtick seam), because long messages were wrapped across
 *     source lines and the catalog holds them flat; a JSX space expression
 *     `{' '}`; and an `&nbsp;` entity.
 *
 * Everything else is escaped, so no rewording slips through.
 *
 * Both ends are word-anchored when they can be. Without that a one-word value is
 * a bare substring test, and short labels pass on coincidence: `Low` matches
 * `Lower`, `Linear` matches `LinearProgress`, `High` matches `HighlightStyle`.
 * A check that accepts a word because another word contains it is not checking
 * anything. The anchor is conditional because `\b` is meaningless next to a
 * non-word character, and plenty of labels start with `·` or end with `.`.
 */
export function verbatimPattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace(/\\\{\\\{\w+\\\}\\\}/g, '[\\s\\S]*?')
    .replace(/<\/?\d>/g, '<[^>]*>')
    .replace(/ +/g, '(?:\\s|[\'`]\\s*\\+\\s*[\'`]|\\{\' \'\\}|&nbsp;)+');
  const lead = /^\w/.test(value) ? '\\b' : '';
  const tail = /\w$/.test(value) ? '\\b' : '';
  return new RegExp(lead + body + tail);
}

/**
 * Flatten a hand-written catalog module to `namespace.a.b` -> value.
 *
 * A brace-depth walk rather than a single regex: the path is what makes a value
 * addressable, and only nesting knows the path.
 */
export function readCatalogValues(catalogText) {
  const values = {};
  const stack = [];
  for (const line of catalogText.split('\n')) {
    const open = /^\s{2,}([A-Za-z][\w]*): \{\s*$/.exec(line);
    if (open) { stack.push(open[1]); continue; }
    if (/^\s{2,}\},?\s*$/.test(line)) { stack.pop(); continue; }
    const leaf = /^\s{4,}([A-Za-z][\w]*): '((?:[^'\\]|\\.)*)',$/.exec(line);
    if (leaf && stack.length > 0) {
      const path = [...stack, leaf[1]].join('.');
      values[path] = leaf[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
  }
  return values;
}

export function checkVerbatim(ref = MIGRATION_BASE_REF, root = ROOT) {
  const source = readBaseSources(ref, root);
  const catalogPath = new URL('../src/core/i18n/catalogs/en-US.ts', import.meta.url);
  const catalogText = readFileSync(catalogPath, 'utf8');
  // Read the values out of the module text rather than importing it: this script
  // has to run under plain node with no TypeScript loader.
  //
  // Keyed by the FULL dotted path. Leaf names alone collide badly once the
  // catalog has more than one namespace — `section`, `intensity` and `color`
  // each occur a dozen times — and a collision does not fail loudly, it
  // silently drops every value but the last from the check.
  const values = readCatalogValues(catalogText);
  const missing = [];
  for (const [key, value] of Object.entries(values)) {
    if (NEW_STRING_EXEMPTIONS.has(key)) continue;
    if (!verbatimPattern(value).test(source)) missing.push({ key, value });
  }
  return { checked: Object.keys(values).length, missing };
}

const invoked = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (invoked.endsWith('scripts/i18n-verbatim-check.mjs')) {
  const refIndex = process.argv.indexOf('--ref');
  const ref = refIndex > 0 ? process.argv[refIndex + 1] : MIGRATION_BASE_REF;
  const { checked, missing } = checkVerbatim(ref);
  if (missing.length === 0) {
    console.log(`${checked} en-US values all trace back verbatim to ${ref}.`);
  } else {
    console.error(`${missing.length} of ${checked} en-US values are NOT in ${ref}:`);
    for (const { key, value } of missing) console.error(`  ${key}: ${JSON.stringify(value)}`);
    console.error('\nEither the string was rewritten (ADR-0001 §3 forbids that for moved text),\n'
      + 'or it is genuinely new — add it to NEW_STRING_EXEMPTIONS with a reason.');
    process.exit(1);
  }
}
