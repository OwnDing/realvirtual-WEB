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
  'src/core/hmi/projects/ProjectsDashboardHost.tsx',
  'src/core/engine/rv-error-visual.ts',
  'src/plugins/annotation-plugin.ts',
  'src/main.ts',
  'index.html',
];

/**
 * Keys the base ref cannot contain verbatim, each with a reason.
 *
 * What ADR-0001 §3 forbids is re-deriving English WORDING. Restructuring how a
 * sentence is assembled is a different thing and sometimes unavoidable, but it
 * still has to be declared here rather than waved through by loosening the
 * matcher — that way the exceptions stay countable and reviewable.
 */
export const NEW_STRING_EXEMPTIONS = new Map([
  ['moved', 'Sentence-frame split. The source built one string with the verb interpolated '
    + '(`"${doc.name}" ${mode === "move" ? "moved" : "copied"} to "${ws.name}".`), which hands a '
    + 'translator a frame they cannot inflect. The English words are unchanged; only the seam moved.'],
  ['copied', 'The other half of the same split — see `moved`.'],
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
 * `{{name}}` becomes `[\s\S]*?` so it can span the `${…}` expression it replaced;
 * everything else is escaped, so no other difference passes.
 */
export function verbatimPattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\\\{\\\{\w+\\\}\\\}/g, '[\\s\\S]*?'));
}

export function checkVerbatim(ref = MIGRATION_BASE_REF, root = ROOT) {
  const source = readBaseSources(ref, root);
  const catalogPath = new URL('../src/core/i18n/catalogs/en-US.ts', import.meta.url);
  const catalogText = readFileSync(catalogPath, 'utf8');
  // Read the values out of the module text rather than importing it: this script
  // has to run under plain node with no TypeScript loader.
  const values = {};
  for (const match of catalogText.matchAll(/^\s{4,}([A-Za-z][\w]*): '((?:[^'\\]|\\.)*)',$/gm)) {
    values[match[1]] = match[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
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
