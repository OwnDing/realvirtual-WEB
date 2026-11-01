// SPDX-License-Identifier: AGPL-3.0-only
import parseSpdx from 'spdx-expression-parse';

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
export function validatePolicy(policy) {
  if (policy?.schemaVersion !== 1 || policy.registry !== 'https://registry.npmjs.org'
    || !Number.isSafeInteger(policy.nodeMajor) || policy.nodeMajor <= 0
    || !/^\d+\.\d+\.\d+$/.test(policy.npmVersion ?? '')
    || !/^\d+\.\d+\.\d+$/.test(policy.cycloneDxVersion ?? '')) throw new Error('Invalid scanner policy');
  for (const field of ['allowedLicenses', 'deniedLicenses']) {
    if (!Array.isArray(policy[field]) || policy[field].some(id => typeof id !== 'string' || !id.trim())) throw new Error(`Invalid policy: ${field}`);
    for (const id of policy[field]) parseSpdx(id);
  }
  for (const days of ['info', 'low', 'moderate'].map(s => policy.reviewDays?.[s])) {
    if (!Number.isSafeInteger(days) || days <= 0 || days > 90) throw new Error('Invalid review deadline policy');
  }
  for (const field of ['releaseMaxAgeHours', 'maxArchiveBytes', 'maxExpandedBytes']) {
    if (!Number.isSafeInteger(policy[field]) || policy[field] <= 0) throw new Error(`Invalid policy: ${field}`);
  }
  if (policy.releaseMaxAgeHours > 24) throw new Error('Release evidence must be fresh within 24 hours');
  return policy;
}
export function licenseDecision(expression, policy) {
  if (typeof expression !== 'string' || !expression.trim()) return { status: 'review', reason: 'missing-license' };
  let tree;
  try { tree = parseSpdx(expression); } catch { return { status: 'review', reason: 'invalid-spdx' }; }
  function visit(node) {
    if (node.conjunction) {
      const left = visit(node.left); const right = visit(node.right);
      if (node.conjunction === 'or') {
        if (left.status === 'allow') return left;
        if (right.status === 'allow') return right;
        return { status: left.status === 'deny' && right.status === 'deny' ? 'deny' : 'review', reason: 'unresolved-choice' };
      }
      if (left.status !== 'allow' || right.status !== 'allow') return { status: [left.status, right.status].includes('deny') ? 'deny' : 'review', reason: 'unresolved-obligations' };
      return { status: 'allow', selected: `(${left.selected} AND ${right.selected})` };
    }
    const id = node.license + (node.plus ? '+' : '') + (node.exception ? ` WITH ${node.exception}` : '');
    if (policy.deniedLicenses.includes(id)) return { status: 'deny', reason: id };
    return policy.allowedLicenses.includes(id) ? { status: 'allow', selected: id } : { status: 'review', reason: id };
  }
  return visit(tree);
}

export function validateExceptions(document, now = new Date()) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.exceptions)) throw new Error('Invalid exceptions document');
  const keys = new Set();
  for (const e of document.exceptions) {
    for (const field of ['id', 'kind', 'finding', 'package', 'version', 'path', 'integrity', 'owner', 'approvedBy', 'approval', 'reason', 'mitigation', 'task', 'createdAt', 'expiresAt']) {
      if (typeof e[field] !== 'string' || !e[field].trim() || /[*?]/.test(e[field]) && ['package', 'version', 'path', 'finding'].includes(field)) throw new Error(`Invalid exception field: ${field}`);
    }
    // Missing distribution rights cannot be waived by a security exception.
    if (e.kind !== 'vulnerability' || !['high', 'moderate', 'low', 'info'].includes(e.severity) || e.knownExploited !== false) throw new Error(`Ineligible exception: ${e.id}`);
    const created = Date.parse(e.createdAt); const expiry = Date.parse(e.expiresAt);
    const max = e.severity === 'high' ? 14 : 30;
    if (!Number.isFinite(created) || !Number.isFinite(expiry) || created > +now || expiry <= +now || expiry <= created || expiry - created > max * 86400000) throw new Error(`Expired or invalid exception: ${e.id}`);
    const key = [e.finding, e.package, e.version, e.path].join('|');
    if (keys.has(key)) throw new Error(`Duplicate exception: ${e.id}`);
    keys.add(key);
  }
  return document.exceptions;
}

export function evaluateAudit(audit, entries, policy, exceptions = [], triage = [], now = new Date(), release = false) {
  validatePolicy(policy);
  if (audit?.auditReportVersion !== 2 || audit.error || !audit.metadata?.dependencies || !audit.metadata?.vulnerabilities || !audit.vulnerabilities || Array.isArray(audit.vulnerabilities)) throw new Error('Incomplete or unsupported npm audit report');
  if (audit.metadata.dependencies.total !== entries.length) throw new Error('Audit dependency coverage does not match lockfile');
  const counts = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
  const summary = audit.metadata.vulnerabilities;
  for (const key of [...SEVERITIES, 'total']) if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) throw new Error('Malformed audit summary');
  if (summary.total !== Object.keys(audit.vulnerabilities).length || summary.total !== SEVERITIES.reduce((sum, s) => sum + summary[s], 0)) throw new Error('Audit summary disagrees with findings');
  const byPath = new Map(entries.map(e => [e.path, e]));
  if (byPath.size !== entries.length) throw new Error('Duplicate dependency path');
  const findings = [];
  for (const [name, item] of Object.entries(audit.vulnerabilities)) {
    if (!item || !SEVERITIES.includes(item.severity) || !Array.isArray(item.nodes) || !item.nodes.length || !Array.isArray(item.via) || !item.via.length) throw new Error(`Malformed advisory: ${name}`);
    counts[item.severity]++;
    if (new Set(item.nodes).size !== item.nodes.length) throw new Error(`Duplicate advisory path: ${name}`);
    for (const via of item.via) {
      if (typeof via === 'string') {
        if (!audit.vulnerabilities[via]) throw new Error(`Unresolved meta-advisory: ${name}`);
      } else if (!via || typeof via !== 'object') throw new Error(`Malformed advisory source: ${name}`);
    }
    const advisories = item.via.filter(v => typeof v === 'object').map(v => {
      if (typeof v.url !== 'string' || !/^https:\/\/[^/]+\//.test(v.url) || !SEVERITIES.includes(v.severity)) throw new Error(`Malformed advisory source: ${name}`);
      return v.url;
    });
    // Meta-vulnerabilities remain visible and blocking; they are not silently discarded.
    const ids = advisories.length ? advisories : [`npm-meta:${name}`];
    for (const path of item.nodes) {
      const entry = byPath.get(path);
      if (!entry || entry.name !== name && entry.installedName !== name) throw new Error(`Unmapped advisory dependency: ${path}`);
      for (const finding of ids) {
        const exact = e => e.finding === finding && e.package === name && e.version === entry.version && e.path === path && e.integrity === entry.integrity;
        const exception = exceptions.find(e => exact(e) && e.severity === item.severity);
        const ticket = triage.find(exact);
        let blocked = ['high', 'critical'].includes(item.severity);
        let reason = blocked ? 'severity' : 'triage-required';
        if (!blocked) {
          const first = Date.parse(ticket?.firstSeen); const due = Date.parse(ticket?.dueAt);
          blocked = !ticket?.owner?.trim() || !ticket?.task?.trim() || !Number.isFinite(first) || !Number.isFinite(due) || first > +now || due <= +now || due <= first || due - first > policy.reviewDays[item.severity] * 86400000;
          if (!blocked) reason = 'tracked';
        }
        if (exception && !(release && ['high', 'critical'].includes(item.severity))) { blocked = false; reason = 'time-limited-exception'; }
        findings.push({ finding, package: name, version: entry.version, path, integrity: entry.integrity, severity: item.severity, blocked, reason, exception: exception?.id ?? null, task: ticket?.task ?? null, fixAvailable: item.fixAvailable });
      }
    }
  }
  if (SEVERITIES.some(s => counts[s] !== summary[s])) throw new Error('Audit severity summary disagrees with findings');
  return { status: findings.some(f => f.blocked) ? 'failed' : 'passed', findings };
}

const DECISION_FIELDS = ['id', 'package', 'version', 'integrity', 'license', 'decision', 'rationale', 'obligations', 'tracking', 'owner', 'approvedBy', 'approval', 'createdAt'];
/**
 * Exact, per-package license judgments (ADR-0022). A decision accepts ONE declared
 * expression for ONE package version and integrity; it never widens
 * `allowedLicenses`, never covers a denied license, and never stands in for
 * missing license text — distribution obligations stay listed on the finding.
 */
export function validateLicenseDecisions(document) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.decisions)) throw new Error('Invalid license decisions document');
  const keys = new Set(); const ids = new Set();
  for (const d of document.decisions) {
    for (const field of DECISION_FIELDS) {
      if (typeof d?.[field] !== 'string' || !d[field].trim()) throw new Error(`Invalid license decision field: ${field}`);
    }
    if (/[*?]/.test(d.package + d.version + d.integrity)) throw new Error(`Wildcard license decision: ${d.id}`);
    if (d.decision !== 'accept') throw new Error(`Unsupported license decision: ${d.id}`);
    // `declared: null` = the manifest declares no license; `license` is then the one
    // identified from the evidence text. Any other `declared` value is meaningless.
    if ('declared' in d && d.declared !== null) throw new Error(`Invalid license decision field: declared (${d.id})`);
    if (!Number.isFinite(Date.parse(d.createdAt))) throw new Error(`Invalid license decision date: ${d.id}`);
    try { parseSpdx(d.license); } catch { throw new Error(`Invalid license decision expression: ${d.id}`); }
    const key = [d.package, d.version, d.integrity].join('|');
    if (keys.has(key) || ids.has(d.id)) throw new Error(`Duplicate license decision: ${d.id}`);
    keys.add(key); ids.add(d.id);
  }
  return document.decisions;
}

export function evaluateLicenses(entries, policy, decisions = []) {
  const used = new Set();
  const findings = entries.map(e => {
    const decision = licenseDecision(e.license, policy);
    const reasons = [...(e.errors ?? [])];
    let accepted = null;
    if (decision.status === 'review') {
      const declaredMatches = d => (e.license == null ? d.declared === null : !('declared' in d) && d.license === e.license);
      accepted = decisions.find(d => d.package === e.name && d.version === e.version && d.integrity === e.integrity && declaredMatches(d)) ?? null;
      // An identified license must itself not be denied by policy.
      if (accepted && e.license == null && licenseDecision(accepted.license, policy).status === 'deny') accepted = null;
      if (accepted) used.add(accepted.id);
    }
    if (decision.status !== 'allow' && !accepted) reasons.push(decision.reason);
    if (!e.evidence?.length) reasons.push('missing-license-text');
    return { package: e.name, version: e.version, path: e.path, declared: e.license ?? null, selected: decision.selected ?? accepted?.license ?? null, status: reasons.length ? 'failed' : 'passed', reasons, decision: accepted?.id ?? null, obligations: accepted?.obligations ?? null, evidenceSource: e.evidenceSource ?? null };
  });
  // A decision that no longer matches the tree is stale evidence, not harmless noise.
  const unusedDecisions = decisions.map(d => d.id).filter(id => !used.has(id));
  return { status: findings.some(f => f.status === 'failed') || unusedDecisions.length ? 'failed' : 'passed', findings, unusedDecisions };
}
