// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual WEB contributors

/**
 * Dependency-free documentation and AI-safety governance gate.
 *
 * Exit 0: all checks passed.
 * Exit 1: governed rule violation.
 * Exit 2: harness/internal environment failure.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const REQUIRED_METADATA = ['doc_id', 'title', 'status', 'owner', 'last_reviewed', 'authority'];
const VALID_STATUSES = new Set(['approved', 'draft', 'reference', 'snapshot', 'superseded', 'generated']);

const REQUIRED_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/LEGACY_DOCUMENT_REGISTER.md',
  'docs/governance/README.md',
  'docs/governance/DEVELOPMENT_CONSTITUTION.md',
  'docs/governance/AI_SAFETY.md',
  'docs/governance/DOCUMENT_PRIORITY.md',
  'docs/governance/CHANGE_MANAGEMENT.md',
  'docs/governance/DEFINITION_OF_DONE.md',
  'docs/governance/HARNESS.md',
  'docs/governance/REPOSITORY_FACTS.md',
  'docs/governance/OPEN_DECISIONS.md',
  'docs/exec-plans/TEMPLATE.md',
  'docs/adr/TEMPLATE.md',
  'docs/acceptance/ACCEPTANCE_MATRIX.md',
  'scripts/verify.sh',
  'scripts/verify-governance-selftest.mjs',
];

const REQUIRED_AGENT_LINKS = [
  'docs/governance/DEVELOPMENT_CONSTITUTION.md',
  'docs/governance/AI_SAFETY.md',
  'docs/governance/DOCUMENT_PRIORITY.md',
  'docs/governance/DEFINITION_OF_DONE.md',
  'docs/exec-plans/TEMPLATE.md',
];

export function parseFrontMatter(text) {
  if (!text.startsWith('---\n')) return { metadata: null, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: null, body: text };
  const metadata = {};
  for (const line of text.slice(4, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }
  return { metadata, body: text.slice(end + 5) };
}

export function expectedStatusForPath(repoPath) {
  const normalizedPath = repoPath.replaceAll('\\', '/');
  if (normalizedPath.startsWith('docs/archive/')) return 'superseded';
  if (normalizedPath.startsWith('docs/references/')) return 'reference';
  if (normalizedPath.startsWith('docs/generated/')) return 'generated';
  if (normalizedPath.startsWith('docs/delivery/snapshots/')) return 'snapshot';
  return null;
}

export function validateMetadata(repoPath, metadata) {
  const errors = [];
  if (!metadata) return [`${repoPath}: missing YAML front matter`];
  for (const key of REQUIRED_METADATA) {
    if (!metadata[key]) errors.push(`${repoPath}: missing metadata field '${key}'`);
  }
  if (metadata.status && !VALID_STATUSES.has(metadata.status)) {
    errors.push(`${repoPath}: invalid status '${metadata.status}'`);
  }
  if (metadata.last_reviewed
    && metadata.last_reviewed !== 'YYYY-MM-DD'
    && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.last_reviewed)) {
    errors.push(`${repoPath}: last_reviewed must be YYYY-MM-DD`);
  }
  const expected = expectedStatusForPath(repoPath);
  if (expected && metadata.status !== expected) {
    errors.push(`${repoPath}: path requires status '${expected}', got '${metadata.status ?? ''}'`);
  }
  const normalizedPath = repoPath.replaceAll('\\', '/');
  if (!normalizedPath.endsWith('/README.md')) {
    if (normalizedPath.startsWith('docs/exec-plans/active/')) {
      if (metadata.status !== 'approved' || metadata.plan_status !== 'active') {
        errors.push(`${repoPath}: active ExecPlan requires status=approved and plan_status=active`);
      }
    }
    if (normalizedPath.startsWith('docs/exec-plans/completed/')) {
      if (metadata.status !== 'approved' || metadata.plan_status !== 'completed') {
        errors.push(`${repoPath}: completed ExecPlan requires status=approved and plan_status=completed`);
      }
    }
  }
  return errors;
}

function stripCode(text) {
  return text
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

export function extractMarkdownTargets(text) {
  const targets = [];
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of stripCode(text).matchAll(linkRe)) targets.push(match[1]);
  return targets;
}

export function dangerousCommandFindings(text) {
  const patterns = [
    ['global Windows Node termination', /\btaskkill\b[^\n]*\/IM\s+node(?:\.exe)?/i],
    ['global Node killall', /\bkillall\s+(?:-\S+\s+)*node\b/i],
    ['global Node pkill', /\bpkill\s+(?:-\S+\s+)*node\b/i],
    ['destructive git reset', /\bgit\s+reset\s+--hard\b/i],
    ['destructive git clean', /\bgit\s+clean\s+-[^\s]*f/i],
    ['root recursive deletion', /\brm\s+-[^\s]*r[^\s]*f[^\n]*(?:\s\/\s*$|\s~(?:\/|\s|$)|\$HOME)/im],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function walk(root, predicate = () => true) {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) output.push(...walk(full, predicate));
    else if (entry.isFile() && predicate(full)) output.push(full);
  }
  return output;
}

function directoriesUnder(root) {
  const output = [root];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    output.push(...directoriesUnder(full));
  }
  return output;
}

function repoPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}

function normalizeLinkTarget(sourceFile, rawTarget) {
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(rawTarget)) return null;
  let target = rawTarget.split('#')[0].split('?')[0];
  if (!target) return null;
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep malformed percent escapes so the existence check fails visibly.
  }
  return normalize(resolve(dirname(sourceFile), target));
}

function checkGovernance() {
  const findings = [];
  const add = (message) => findings.push(message);

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(ROOT, path))) add(`missing required file: ${path}`);
  }

  const docsRoot = join(ROOT, 'docs');
  for (const directory of directoriesUnder(docsRoot)) {
    if (!existsSync(join(directory, 'README.md'))) {
      add(`${repoPath(directory)}: directory is missing README.md`);
    }
  }

  const docFiles = walk(docsRoot, (path) => path.endsWith('.md'));
  const ids = new Map();
  for (const file of docFiles) {
    const path = repoPath(file);
    const { metadata } = parseFrontMatter(readFileSync(file, 'utf8'));
    for (const error of validateMetadata(path, metadata)) add(error);
    if (!metadata?.doc_id) continue;
    const previous = ids.get(metadata.doc_id);
    if (previous) add(`duplicate doc_id '${metadata.doc_id}': ${previous}, ${path}`);
    else ids.set(metadata.doc_id, path);
  }

  const linkedDocs = [join(ROOT, 'AGENTS.md'), join(ROOT, 'CLAUDE.md'), ...docFiles];
  for (const file of linkedDocs) {
    const text = readFileSync(file, 'utf8');
    for (const rawTarget of extractMarkdownTargets(text)) {
      const target = normalizeLinkTarget(file, rawTarget);
      if (!target) continue;
      const rel = repoPath(target);
      if (rel.startsWith('../') || rel === '..') {
        add(`${repoPath(file)}: link leaves repository: ${rawTarget}`);
        continue;
      }
      if (!existsSync(target)) add(`${repoPath(file)}: dangling link '${rawTarget}'`);
    }
  }

  const legacyRegister = readFileSync(join(ROOT, 'docs/LEGACY_DOCUMENT_REGISTER.md'), 'utf8');
  const registered = new Set(
    [...legacyRegister.matchAll(/`((?:doc-[^`/]+|webviewer\.mcp)\.md)`/g)].map((match) => match[1]),
  );
  const legacyDocs = readdirSync(ROOT)
    .filter((name) => /^doc-.+\.md$/.test(name))
    .concat(existsSync(join(ROOT, 'webviewer.mcp.md')) ? ['webviewer.mcp.md'] : []);
  for (const file of legacyDocs) {
    if (!registered.has(file)) add(`legacy document is not registered: ${file}`);
  }
  for (const file of registered) {
    if (!existsSync(join(ROOT, file))) add(`legacy register names missing file: ${file}`);
  }

  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  for (const target of REQUIRED_AGENT_LINKS) {
    if (!agents.includes(target)) add(`AGENTS.md missing required governance link: ${target}`);
  }
  const claudeLines = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').split('\n').length;
  if (claudeLines > 60) add(`CLAUDE.md must remain a short compatibility entry (found ${claudeLines} lines)`);

  const commandDir = join(ROOT, '.claude', 'commands');
  if (existsSync(commandDir)) {
    for (const file of walk(commandDir, (path) => path.endsWith('.md'))) {
      for (const label of dangerousCommandFindings(readFileSync(file, 'utf8'))) {
        add(`${repoPath(file)}: unsafe AI command pattern: ${label}`);
      }
    }
  }

  return findings;
}

function main() {
  const findings = checkGovernance();
  if (findings.length === 0) {
    console.log(`✓ governance gate passed (${walk(join(ROOT, 'docs'), (path) => path.endsWith('.md')).length} governed documents)`);
    return;
  }
  console.error(`Governance gate failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exitCode = 1;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(`Governance harness error: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 2;
  }
}
