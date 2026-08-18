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
const POLICY_PATH = join(ROOT, 'docs', 'governance', 'document-metadata-policy.json');
let documentPolicy = null;
let documentPolicyError = null;

try {
  documentPolicy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
} catch (error) {
  documentPolicyError = error;
}

function requireDocumentPolicy() {
  if (documentPolicyError) {
    throw new Error(`cannot load ${relative(ROOT, POLICY_PATH)}: ${documentPolicyError.message}`);
  }
  const arrayFields = ['statuses', 'authorities', 'owners'];
  for (const field of arrayFields) {
    const values = documentPolicy?.[field];
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string')) {
      throw new Error(`document metadata policy requires a non-empty string array '${field}'`);
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`document metadata policy contains duplicate '${field}' values`);
    }
  }
  const combinations = documentPolicy?.allowed_authorities_by_status;
  if (!combinations || typeof combinations !== 'object') {
    throw new Error('document metadata policy requires allowed_authorities_by_status');
  }
  const validAuthorities = new Set(documentPolicy.authorities);
  for (const status of documentPolicy.statuses) {
    const allowed = combinations[status];
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new Error(`document metadata policy has no authority mapping for status '${status}'`);
    }
    for (const authority of allowed) {
      if (!validAuthorities.has(authority)) {
        throw new Error(`document metadata policy maps status '${status}' to unknown authority '${authority}'`);
      }
    }
  }
  const warningDays = documentPolicy.review_warning_days;
  if (!warningDays || typeof warningDays !== 'object') {
    throw new Error('document metadata policy requires review_warning_days');
  }
  for (const [status, days] of Object.entries(warningDays)) {
    if (!documentPolicy.statuses.includes(status) || !Number.isInteger(days) || days < 1) {
      throw new Error(`document metadata policy has invalid review warning '${status}: ${days}'`);
    }
  }
  return documentPolicy;
}

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
  'docs/governance/KNOWN_DEVIATIONS.md',
  'docs/governance/document-metadata-policy.json',
  'docs/exec-plans/TEMPLATE.md',
  'docs/exec-plans/proposed/README.md',
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
  const normalizedText = text.replaceAll('\r\n', '\n');
  if (!normalizedText.startsWith('---\n')) return { metadata: null, body: text };
  const end = normalizedText.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: null, body: text };
  const metadata = {};
  for (const line of normalizedText.slice(4, end).split('\n')) {
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
  return { metadata, body: normalizedText.slice(end + 5) };
}

export function expectedStatusForPath(repoPath) {
  const normalizedPath = repoPath.replaceAll('\\', '/');
  if (normalizedPath.endsWith('/README.md')) return null;
  if (normalizedPath.startsWith('docs/archive/')) return 'superseded';
  if (normalizedPath.startsWith('docs/references/')) return 'reference';
  if (normalizedPath.startsWith('docs/generated/')) return 'generated';
  if (normalizedPath.startsWith('docs/delivery/snapshots/')) return 'snapshot';
  return null;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateExecPlanPlacement(repoPath, metadata) {
  const normalizedPath = repoPath.replaceAll('\\', '/');
  if (!normalizedPath.startsWith('docs/exec-plans/')) return [];
  const relativePath = normalizedPath.slice('docs/exec-plans/'.length);
  if (relativePath === 'README.md' || relativePath === 'TEMPLATE.md') return [];
  const [directory, fileName, ...rest] = relativePath.split('/');
  const expected = {
    proposed: { status: 'draft', plan_status: 'proposed' },
    active: { status: 'approved', plan_status: 'active' },
    completed: { status: 'approved', plan_status: 'completed' },
  }[directory];
  if (!expected || rest.length > 0 || !fileName) {
    return [`${repoPath}: ExecPlan must be directly under proposed/, active/ or completed/`];
  }
  if (fileName === 'README.md') return [];
  const errors = [];
  if (!/^EP-[A-Z0-9]+-\d{3}-.+\.md$/.test(fileName)) {
    errors.push(`${repoPath}: ExecPlan filename must match EP-<AREA>-<NNN>-<slug>.md`);
  }
  if (metadata?.status !== expected.status || metadata?.plan_status !== expected.plan_status) {
    errors.push(`${repoPath}: ${directory} ExecPlan requires status=${expected.status} and plan_status=${expected.plan_status}`);
  }
  return errors;
}

export function validateMetadata(repoPath, metadata) {
  const policy = requireDocumentPolicy();
  const errors = [];
  if (!metadata) return [`${repoPath}: missing YAML front matter`];
  const normalizedPath = repoPath.replaceAll('\\', '/');
  const isTemplate = normalizedPath.endsWith('/TEMPLATE.md');
  for (const key of REQUIRED_METADATA) {
    if (!metadata[key]) errors.push(`${repoPath}: missing metadata field '${key}'`);
  }
  if (metadata.status && !policy.statuses.includes(metadata.status)) {
    errors.push(`${repoPath}: invalid status '${metadata.status}'`);
  }
  if (metadata.owner === '<owner>' && !isTemplate) {
    errors.push(`${repoPath}: owner placeholder is only allowed in TEMPLATE.md`);
  } else if (metadata.owner && metadata.owner !== '<owner>' && !policy.owners.includes(metadata.owner)) {
    errors.push(`${repoPath}: invalid owner '${metadata.owner}'`);
  }
  if (metadata.authority && !policy.authorities.includes(metadata.authority)) {
    errors.push(`${repoPath}: invalid authority '${metadata.authority}'`);
  } else if (metadata.status && metadata.authority
    && !policy.allowed_authorities_by_status[metadata.status]?.includes(metadata.authority)) {
    errors.push(`${repoPath}: authority '${metadata.authority}' is not allowed for status '${metadata.status}'`);
  }
  if (metadata.last_reviewed === 'YYYY-MM-DD' && !isTemplate) {
    errors.push(`${repoPath}: last_reviewed placeholder is only allowed in TEMPLATE.md`);
  } else if (metadata.last_reviewed !== 'YYYY-MM-DD' && !isCalendarDate(metadata.last_reviewed)) {
    errors.push(`${repoPath}: last_reviewed must be YYYY-MM-DD`);
  }
  const expected = expectedStatusForPath(repoPath);
  if (expected && metadata.status !== expected) {
    errors.push(`${repoPath}: path requires status '${expected}', got '${metadata.status ?? ''}'`);
  }
  errors.push(...validateExecPlanPlacement(repoPath, metadata));
  return errors;
}

export function metadataWarnings(repoPath, metadata, now = new Date()) {
  if (!metadata?.status || !isCalendarDate(metadata.last_reviewed)) return [];
  const warningDays = requireDocumentPolicy().review_warning_days?.[metadata.status];
  if (!Number.isInteger(warningDays) || warningDays < 1) return [];
  const reviewed = new Date(`${metadata.last_reviewed}T00:00:00.000Z`);
  const ageDays = Math.floor((now.valueOf() - reviewed.valueOf()) / 86_400_000);
  return ageDays > warningDays
    ? [`${repoPath}: last reviewed ${ageDays} days ago (warning threshold ${warningDays})`]
    : [];
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

export function missingIndexEntries(readmeText, childFileNames) {
  const linked = new Set();
  for (let target of extractMarkdownTargets(readmeText)) {
    if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed target cannot satisfy index membership.
    }
    target = target.replaceAll('\\', '/').replace(/^\.\//, '');
    if (!target.includes('/')) linked.add(target);
  }
  return childFileNames.filter((name) => !linked.has(name));
}

export function dangerousCommandFindings(text) {
  const patterns = [
    ['global Windows Node termination', /\btaskkill\b[^\n]*\/IM\s+node(?:\.exe)?/i],
    ['global Node killall', /\bkillall\s+(?:-\S+\s+)*node\b/i],
    ['global Node pkill', /\bpkill\s+(?:-\S+\s+)*node\b/i],
    ['destructive git reset', /\bgit\s+reset\s+--hard\b/i],
    ['destructive git clean', /\bgit\s+clean\s+(?=[^\n]*-[^\s]*f)[^\n]+/i],
    ['history-rewriting force push', /\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|-f)(?:\s|$)/im],
    ['broad git checkout', /\bgit\s+checkout\s+--\s+\.(?:\s|$)/im],
    ['broad git restore', /\bgit\s+restore(?:\s+--\S+)*\s+\.(?:\s|$)/im],
    ['recursive force deletion instruction', /\brm\s+(?=[^\n]*-[^\s]*r)(?=[^\n]*-[^\s]*f)[^\n]+/i],
    ['remote script piped to shell', /\b(?:curl|wget)\b[^\n|]*\|[^\n]*(?:\bsh\b|\bbash\b)/i],
    ['package publication', /\bnpm\s+publish\b/i],
    ['privilege escalation', /(?:^|\n|[;&|])\s*sudo\s+/i],
    ['world-writable permission', /\bchmod\s+(?:-\S+\s+)*0?777\b/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function extractShellFences(text) {
  const blocks = [];
  const fence = /^```(?:bash|sh|shell|zsh|powershell|pwsh|cmd)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gim;
  for (const match of text.matchAll(fence)) blocks.push(match[1]);
  return blocks;
}

export const REQUIRED_CLAUDE_DENY_RULES = [
  'Bash(git push *)',
  'Bash(git reset --hard *)',
  'Bash(git clean *)',
  'Bash(git checkout -- .)',
  'Bash(git restore .)',
  'Bash(rm -rf *)',
  'Bash(rm -fr *)',
  'Bash(killall *)',
  'Bash(pkill *)',
  'Bash(taskkill *)',
  'Bash(sudo *)',
  'Bash(npm publish *)',
  'Bash(chmod 777 *)',
];

export function claudePermissionFindings(settings) {
  const deny = settings?.permissions?.deny;
  if (!Array.isArray(deny)) return ['.claude/settings.json: permissions.deny must be an array'];
  return REQUIRED_CLAUDE_DENY_RULES
    .filter((rule) => !deny.includes(rule))
    .map((rule) => `.claude/settings.json: missing required deny rule '${rule}'`);
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
  const warnings = [];
  const add = (message) => findings.push(message);
  requireDocumentPolicy();

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(ROOT, path))) add(`missing required file: ${path}`);
  }

  const docsRoot = join(ROOT, 'docs');
  for (const directory of directoriesUnder(docsRoot)) {
    const readme = join(directory, 'README.md');
    if (!existsSync(readme)) {
      add(`${repoPath(directory)}: directory is missing README.md`);
      continue;
    }
    const childDocs = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
      .map((entry) => entry.name);
    for (const missing of missingIndexEntries(readFileSync(readme, 'utf8'), childDocs)) {
      add(`${repoPath(readme)}: missing direct-child index entry for '${missing}'`);
    }
  }

  const docFiles = walk(docsRoot, (path) => path.endsWith('.md'));
  const ids = new Map();
  for (const file of docFiles) {
    const path = repoPath(file);
    const { metadata } = parseFrontMatter(readFileSync(file, 'utf8'));
    for (const error of validateMetadata(path, metadata)) add(error);
    warnings.push(...metadataWarnings(path, metadata));
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

  const executableMarkdown = [
    join(ROOT, 'AGENTS.md'),
    join(ROOT, 'CLAUDE.md'),
    ...docFiles.filter((file) => repoPath(file).startsWith('docs/exec-plans/active/')),
  ];
  for (const file of executableMarkdown) {
    const commands = extractShellFences(readFileSync(file, 'utf8')).join('\n');
    for (const label of dangerousCommandFindings(commands)) {
      add(`${repoPath(file)}: unsafe executable instruction: ${label}`);
    }
  }

  const workflowRoot = join(ROOT, '.github', 'workflows');
  if (existsSync(workflowRoot)) {
    for (const file of walk(workflowRoot, (path) => /\.ya?ml$/i.test(path))) {
      for (const label of dangerousCommandFindings(readFileSync(file, 'utf8'))) {
        add(`${repoPath(file)}: unsafe workflow command pattern: ${label}`);
      }
    }
  }

  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    for (const label of dangerousCommandFindings(String(command))) {
      add(`package.json#scripts.${name}: unsafe command pattern: ${label}`);
    }
  }

  try {
    const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
    for (const finding of claudePermissionFindings(settings)) add(finding);
  } catch (error) {
    add(`.claude/settings.json: invalid JSON (${error.message})`);
  }

  return { findings, warnings };
}

function main() {
  const { findings, warnings } = checkGovernance();
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
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
