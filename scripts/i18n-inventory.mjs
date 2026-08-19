// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * i18n-inventory.mjs — the reproducible user-visible-text inventory (EP-I18N-001 Milestone 1).
 *
 * WHY A SCRIPT AND NOT A NUMBER IN A DOCUMENT: Accepted `ADR-0001` and Active
 * `EP-I18N-001` both forbid freezing one-shot statistics into governed docs. Any
 * count that reaches an acceptance record has to come from here, with the command,
 * the schema version and the ignore reasons stored alongside it.
 *
 * WHAT IT IS NOT: this is a DEBT LOCATOR, not a translation extractor. It answers
 * "where is user-visible text still hardcoded, and of what kind" so the golden
 * slice can be scoped and so new debt fails a gate. It deliberately does not
 * produce keys, catalogs or translations.
 *
 * Parsing goes through the TypeScript AST rather than regex: JSX text, attribute
 * initializers, registration object properties and canvas draw calls are all
 * shapes a regex gets wrong in both directions, and a debt gate that cries wolf
 * gets disabled by the first person it blocks.
 *
 *   node scripts/i18n-inventory.mjs              # human report
 *   node scripts/i18n-inventory.mjs --json       # full findings, machine readable
 *   node scripts/i18n-inventory.mjs --write      # refresh tests/i18n-inventory-baseline.json
 *
 * The guard test `tests/i18n-inventory.node.test.ts` recomputes this scan and
 * fails when the baseline drifts in either direction — upward means new
 * hardcoded text (UI-1), downward means a migration landed and the baseline owes
 * an update.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'tests', 'i18n-inventory-baseline.json');
const EXCEPTIONS_PATH = join(ROOT, 'scripts', 'i18n-inventory-exceptions.json');

/** Bump when a classification rule changes; the baseline carries it so a stale one is obvious. */
export const SCHEMA_VERSION = 3;

/**
 * The categories, in migration-planning order.
 *
 * They are not severity levels — they are DIFFERENT MIGRATION MECHANICS. React
 * copy needs a hook, a registry label needs a key or getter (ADR-0001 §9), a
 * canvas label additionally needs texture invalidation, and an `Intl` call site
 * needs an explicit locale rather than a translation at all. Merging them would
 * hide exactly the distinctions the golden slice is scoped by.
 */
export const GATED_CATEGORIES = /** @type {const} */ ([
  'react-copy',      // JSX text and copy-bearing JSX attributes
  'a11y-name',       // accessible names: aria-label / alt / title on host elements
  'plugin-registry', // label/title/tooltip string literals in non-React registration objects
  'dynamic-text',    // interpolated prose sitting in a user-visible position
  'canvas-texture',  // text baked into a CanvasTexture via fillText/strokeText
  'pre-boot',        // text visible before React mounts (index.html + src/main.ts DOM writes)
  'dom-text',        // imperative DOM text outside the pre-boot path
  'ui-state-text',   // prose handed to a state setter that renders it (setMessage, setError, …)
]);

/**
 * Counted and reported, deliberately NOT gated.
 *
 * A static scan cannot tell a user-surfaced error from an internal invariant,
 * and `Intl` call sites are a locale-correctness surface rather than hardcoded
 * text at all. Gating either one would fail ordinary engineering work that has
 * nothing to do with i18n, and a gate that blocks the wrong thing gets switched
 * off. They are reported so the migration can triage them per site; they are not
 * part of the committed baseline, because an ungated number that drifts silently
 * is worse than one you recompute on demand.
 */
export const ADVISORY_CATEGORIES = /** @type {const} */ (['error-message', 'intl-format']);

export const CATEGORIES = /** @type {const} */ ([...GATED_CATEGORIES, ...ADVISORY_CATEGORIES]);

/** JSX attributes whose string value is user-visible copy. */
const COPY_ATTRS = new Set([
  'label', 'placeholder', 'helperText', 'primary', 'secondary', 'tooltip',
  'caption', 'heading', 'subtitle', 'emptyText', 'confirmText', 'cancelText',
  'submitLabel', 'noOptionsText', 'loadingText', 'message', 'text',
]);

/** JSX attributes that carry an accessible name. `title` is resolved by tag case — see classifyJsxAttribute. */
const A11Y_ATTRS = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'alt', 'title']);

/**
 * Attributes that look textual but never are. Deny beats allow.
 *
 * `name` is a form field name, `variant`/`color`/`size` are design tokens, and
 * `sx`/`style`/`className` are styling. Every one of these produced a false
 * positive on the first run over src/.
 */
const DENY_ATTRS = new Set([
  'key', 'id', 'className', 'class', 'sx', 'style', 'variant', 'color', 'size',
  'href', 'src', 'type', 'name', 'role', 'value', 'defaultValue', 'component',
  'anchorEl', 'align', 'justify', 'direction', 'position', 'placement', 'edge',
  'severity', 'orientation', 'display', 'overflow', 'width', 'height', 'data-testid',
]);

/** Object properties that register user-visible copy with a registry, menu or slot. */
const REGISTRY_PROPS = new Set([
  'label', 'title', 'tooltip', 'description', 'caption', 'heading',
  'placeholder', 'helperText', 'emptyText', 'message', 'text', 'summary',
]);

/** Properties named like copy that are identifiers or config in this codebase. */
const DENY_PROPS = new Set(['id', 'key', 'name', 'type', 'kind', 'variant', 'icon', 'color']);

const DOM_TEXT_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'placeholder', 'title', 'alt']);

/**
 * State setters that put their argument on screen.
 *
 * `setMessage('Close the project before deleting it.')` renders into a Snackbar
 * one component away, and no JSX-position rule can see that. The naming
 * convention is the only honest signal available to a static scan, so the match
 * is deliberately narrow — `set*` plus a suffix that names the thing shown —
 * rather than "any function taking a string", which would drown the gate.
 */
const UI_STATE_SETTER = /^set([A-Z][A-Za-z]*)?(Message|Error|Status|Warning|Label|Title|Text|Caption|Hint)$/;

const LOCALE_METHODS = new Set([
  'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
]);

const INTL_CTORS = new Set([
  'DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'ListFormat',
  'PluralRules', 'Collator', 'DisplayNames',
]);

/** Files whose text is developer-facing or already extracted. */
const SKIP_FILE = [
  /\.d\.ts$/,
  /^src\/rv-test-runner\.ts$/,           // in-app test harness, never shipped UI chrome
  /^src\/plugins\/snap-point\/strings\.ts$/, // already an extracted table (ADR-0001 adapter path)
  // The catalogs ARE the extraction target. Counting them would make every
  // migration look like it moved debt sideways instead of removing it, and
  // would grow the "debt" number every time a translation is added.
  /^src\/core\/i18n\/catalogs\//,
];

// ---------------------------------------------------------------------------
// Prose detection
// ---------------------------------------------------------------------------

const NON_PROSE = [
  /^[a-z][a-z0-9+.-]*:\/\//i,          // any scheme: http, mqtt, opc.tcp, ws
  /^[./~@]/,                       // paths, module specifiers, css-ish leading chars
  /^#[0-9a-f]{3,8}$/i,             // hex colors
  /^(rgba?|hsla?|calc|var|url)\(/i,
  /^[\d\s.,%+\-/*x×]+$/,           // numbers, dimensions, ratios
  /^\d+(\.\d+)?(px|em|rem|vh|vw|s|ms|deg|%)$/i,
  /^[a-z0-9]+([-_][a-z0-9]+)+$/,   // kebab/snake identifiers: rv-extras-editor, node_id
  /^[a-z]+([A-Z][a-z0-9]*)+$/,     // camelCase identifiers
  /^[A-Z0-9_]{2,}$/,               // SCREAMING_CASE constants
  /^\w+\/\w+/,                     // mime types, paths
  /^[^a-zA-Z]*$/,                  // no letters at all
];

/**
 * True when a literal reads as something a user is meant to read.
 *
 * The single-lowercase-word rejection is the load-bearing rule: `'auto'`,
 * `'none'`, `'dense'` and friends are enum values, and they outnumbered real
 * copy on the first pass. A real one-word label in this UI is capitalised
 * ("Retry", "Settings"), which is exactly what survives here.
 */
export function hasProse(raw) {
  const value = String(raw ?? '').trim();
  if (value.length < 2) return false;
  if (NON_PROSE.some((re) => re.test(value))) return false;
  const letters = value.match(/[A-Za-z一-鿿]/g) ?? [];
  if (letters.length < 2) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1 && /^[a-z]/.test(value) && !/[.:!?]/.test(value)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// AST scan
// ---------------------------------------------------------------------------

/**
 * The user-visible text a node carries, and whether it is interpolated.
 *
 * A `${}` in a user-visible position is not noise — it is the dynamic device
 * text the plan calls out, and it migrates differently (an interpolated key
 * rather than a flat one), so it earns its own category.
 */
function uiText(node) {
  const literal = literalText(node);
  if (literal !== null) return hasProse(literal) ? { text: literal, dynamic: false } : null;
  const inner = node && ts.isJsxExpression(node) && node.expression ? node.expression : node;
  if (inner && ts.isTemplateExpression(inner)) {
    const prose = templateProse(inner);
    return prose ? { text: prose, dynamic: true } : null;
  }
  if (inner && ts.isConditionalExpression(inner)) {
    // `mode === 'ar' ? 'AR Navigation' : 'VR Navigation'` — both branches are copy.
    const branches = [uiText(inner.whenTrue), uiText(inner.whenFalse)].filter(Boolean);
    if (branches.length) {
      return { text: branches.map((b) => b.text).join(' | '), dynamic: branches.some((b) => b.dynamic) };
    }
  }
  return null;
}

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) return literalText(node.expression);
  return null;
}

/** Static prose carried by a template literal, ignoring the interpolated holes. */
function templateProse(node) {
  if (!ts.isTemplateExpression(node)) return null;
  const chunks = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  const joined = chunks.join(' ').trim();
  return hasProse(joined) ? joined : null;
}

function isInsideConsoleCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)
      && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === 'console') {
      return true;
    }
  }
  return false;
}

function jsxTagName(attribute) {
  const opening = attribute.parent?.parent;
  if (!opening || !opening.tagName) return '';
  return opening.tagName.getText?.() ?? '';
}

function classifyJsxAttribute(attribute, name) {
  if (DENY_ATTRS.has(name) || name.startsWith('data-') || name.startsWith('on')) return null;
  if (name === 'title') {
    // `<Tooltip title="Reset view">` is visible copy; `<button title="…">` is an
    // accessible name. Host elements are lowercase in JSX — that is the whole test.
    const tag = jsxTagName(attribute);
    return tag && /^[a-z]/.test(tag) ? 'a11y-name' : 'react-copy';
  }
  if (A11Y_ATTRS.has(name)) return 'a11y-name';
  if (COPY_ATTRS.has(name)) return 'react-copy';
  return null;
}

/**
 * Scan one source file. `repoPath` decides TSX vs TS parsing and pre-boot scope,
 * so callers may pass a virtual path (the fixtures do).
 */
export function scanSource(repoPath, source) {
  const findings = [];
  const isTsx = repoPath.endsWith('.tsx');
  const isPreBoot = repoPath === 'src/main.ts';
  const sf = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const add = (node, category, text, extra = {}) => {
    findings.push({
      file: repoPath,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      category,
      text: String(text).replace(/\s+/g, ' ').trim().slice(0, 120),
      ...extra,
    });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (hasProse(text)) add(node, 'react-copy', text);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      const category = classifyJsxAttribute(node, name);
      const found = uiText(node.initializer);
      if (category && found) add(node, found.dynamic ? 'dynamic-text' : category, found.text);
    } else if (ts.isJsxExpression(node) && node.expression && node.parent
      && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      // A `{`Speed ${v} m/s`}` child renders as visible copy just like JSX text.
      const found = uiText(node.expression);
      if (found?.dynamic) add(node, 'dynamic-text', found.text);
    } else if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
        ? node.name.text : null;
      const found = name && !DENY_PROPS.has(name) && REGISTRY_PROPS.has(name)
        ? uiText(node.initializer) : null;
      if (found) {
        add(node, found.dynamic ? 'dynamic-text' : (isTsx ? 'react-copy' : 'plugin-registry'), found.text);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && UI_STATE_SETTER.test(node.expression.text)) {
      const found = node.arguments[0] ? uiText(node.arguments[0]) : null;
      if (found) add(node, 'ui-state-text', found.text);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'fillText' || method === 'strokeText') {
        const found = node.arguments[0] ? uiText(node.arguments[0]) : null;
        if (found) add(node, 'canvas-texture', found.text);
      } else if (LOCALE_METHODS.has(method)) {
        const first = node.arguments[0];
        const explicit = Boolean(first) && first.kind !== ts.SyntaxKind.UndefinedKeyword
          && !(ts.isIdentifier(first) && first.text === 'undefined');
        add(node, 'intl-format', `${method}()`, { localeExplicit: explicit });
      }
    } else if ((ts.isNewExpression(node) || ts.isCallExpression(node))
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'Intl'
      && INTL_CTORS.has(node.expression.name.text)) {
      const first = node.arguments?.[0];
      const explicit = Boolean(first) && !(ts.isIdentifier(first) && first.text === 'undefined');
      add(node, 'intl-format', `Intl.${node.expression.name.text}`, { localeExplicit: explicit });
    } else if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && DOM_TEXT_PROPS.has(node.left.name.text)) {
      const found = uiText(node.right);
      if (found) add(node, isPreBoot ? 'pre-boot' : 'dom-text', found.text);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
      && /Error$/.test(node.expression.text)) {
      const arg = node.arguments?.[0];
      const text = arg ? (literalText(arg) ?? templateProse(arg)) : null;
      if (text && !isInsideConsoleCall(node)) add(node, 'error-message', text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** index.html renders before any bundle runs, so its text is scanned as markup. */
export function scanHtml(repoPath, source) {
  const findings = [];
  const body = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  for (const match of body.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1].trim();
    if (hasProse(text)) {
      findings.push({ file: repoPath, line: lineOf(match.index), category: 'pre-boot', text });
    }
  }
  for (const match of body.matchAll(/\b(title|aria-label|placeholder|alt)="([^"]+)"/g)) {
    if (hasProse(match[2])) {
      findings.push({ file: repoPath, line: lineOf(match.index), category: 'pre-boot', text: match[2] });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Repository scan
// ---------------------------------------------------------------------------

function collectSources(dir, root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectSources(path, root, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const repoPath = relative(root, path).replace(/\\/g, '/');
      if (!SKIP_FILE.some((re) => re.test(repoPath))) out.push(repoPath);
    }
  }
  return out;
}

export function loadExceptions(root = ROOT) {
  const path = root === ROOT ? EXCEPTIONS_PATH : join(root, 'scripts', 'i18n-inventory-exceptions.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).exceptions ?? [];
}

/** True when `finding` is covered by `exception`. Matching is exact on file+category, substring on text. */
export function matchesException(finding, exception) {
  if (exception.file !== finding.file) return false;
  if (exception.category && exception.category !== finding.category) return false;
  return finding.text.includes(exception.match);
}

/**
 * Scan the repository. Returns findings, the per-file/per-category tallies and
 * which exceptions actually fired — an exception nobody hits is dead weight and
 * the guard test rejects it.
 */
export function computeInventory(root = ROOT) {
  const exceptions = loadExceptions(root);
  const used = new Set();
  const findings = [];

  for (const repoPath of collectSources(join(root, 'src'), root).sort()) {
    findings.push(...scanSource(repoPath, readFileSync(join(root, repoPath), 'utf8')));
  }
  const htmlPath = join(root, 'index.html');
  if (existsSync(htmlPath)) findings.push(...scanHtml('index.html', readFileSync(htmlPath, 'utf8')));

  const kept = findings.filter((finding) => {
    const hit = exceptions.findIndex((exception) => matchesException(finding, exception));
    if (hit < 0) return true;
    used.add(hit);
    return false;
  });

  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const files = {};
  for (const finding of kept) {
    totals[finding.category] += 1;
    if (!GATED_CATEGORIES.includes(finding.category)) continue;
    files[finding.file] ??= {};
    files[finding.file][finding.category] = (files[finding.file][finding.category] ?? 0) + 1;
  }
  const sortedFiles = Object.fromEntries(
    Object.keys(files).sort().map((file) => [
      file,
      Object.fromEntries(GATED_CATEGORIES.filter((c) => files[file][c]).map((c) => [c, files[file][c]])),
    ]),
  );
  const gatedTotal = GATED_CATEGORIES.reduce((sum, c) => sum + totals[c], 0);

  return {
    findings: kept,
    advisory: {
      ...Object.fromEntries(ADVISORY_CATEGORIES.map((c) => [c, totals[c]])),
      intlWithoutExplicitLocale: kept.filter((f) => f.category === 'intl-format' && f.localeExplicit === false).length,
    },
    baseline: {
      schemaVersion: SCHEMA_VERSION,
      generator: 'scripts/i18n-inventory.mjs',
      command: 'node scripts/i18n-inventory.mjs --write',
      note: 'Gated categories only. ADVISORY_CATEGORIES are reported by the script, never committed — see scripts/i18n-inventory.mjs.',
      totals: Object.fromEntries(GATED_CATEGORIES.map((c) => [c, totals[c]])),
      total: gatedTotal,
      fileCount: Object.keys(sortedFiles).length,
      files: sortedFiles,
    },
    unusedExceptions: exceptions
      .map((exception, index) => ({ exception, index }))
      .filter(({ index }) => !used.has(index))
      .map(({ exception }) => exception),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedPath = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (invokedPath.endsWith('scripts/i18n-inventory.mjs')) {
  const { findings, baseline, advisory, unusedExceptions } = computeInventory();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ baseline, advisory, findings, unusedExceptions }, null, 2));
  } else if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`${baseline.total} gated findings in ${baseline.fileCount} files → tests/i18n-inventory-baseline.json`);
  } else {
    console.log('GATED — the incremental debt gate compares these against the baseline:');
    for (const category of GATED_CATEGORIES) {
      console.log(`${String(baseline.totals[category]).padStart(5)}  ${category}`);
    }
    console.log(`${String(baseline.total).padStart(5)}  TOTAL in ${baseline.fileCount} files`);
    console.log('\nADVISORY — reported for migration triage, deliberately not gated:');
    for (const category of ADVISORY_CATEGORIES) {
      console.log(`${String(advisory[category]).padStart(5)}  ${category}`);
    }
    console.log(`${String(advisory.intlWithoutExplicitLocale).padStart(5)}    ...of which Intl/toLocale sites take no explicit locale (ADR-0001 §6)`);
    if (unusedExceptions.length) {
      console.log(`\n  WARNING ${unusedExceptions.length} exception(s) matched nothing:`);
      for (const exception of unusedExceptions) console.log(`    ${exception.file} — ${exception.match}`);
    }
  }
}
