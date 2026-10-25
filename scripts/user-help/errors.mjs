// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { computeInventory } from '../i18n-inventory.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function errorSites(findings) {
  const counts = new Map();
  return findings.filter(f => f.category === 'error-message').map(f => {
    const key = `${f.file}\n${f.text}`, occurrence = (counts.get(key) ?? 0) + 1; counts.set(key, occurrence);
    return { id: createHash('sha256').update(`${key}\n${occurrence}`).digest('hex').slice(0, 24), file: f.file, text: f.text, occurrence };
  });
}
export function validateTriage(sites, registry) {
  const errors = [], records = new Map();
  const categories = ['localized-code', 'ui-boundary', 'internal-contract', 'specialist-followup'];
  for (const entry of registry.sites ?? []) {
    if (records.has(entry.id)) errors.push(`duplicate:${entry.id}`);
    records.set(entry.id, entry);
    if (!categories.includes(entry.classification) || !entry.rationale || !entry.evidence?.length || !entry.owner) errors.push(`incomplete:${entry.id}`);
    if (entry.classification === 'specialist-followup' && !entry.followup) errors.push(`unowned-followup:${entry.id}`);
  }
  for (const site of sites) {
    const entry = records.get(site.id);
    if (!entry || entry.file !== site.file || entry.text !== site.text || entry.occurrence !== site.occurrence) errors.push(`untriaged:${site.file}:${site.id}`);
    records.delete(site.id);
  }
  for (const id of records.keys()) errors.push(`stale:${id}`);
  return errors;
}
export function checkErrorBoundaries() {
  const registry = JSON.parse(readFileSync(resolve(root, 'scripts/user-help/error-triage.json'), 'utf8'));
  const errors = validateTriage(errorSites(computeInventory().findings), registry);
  for (const entry of registry.sites) for (const path of entry.evidence) if (!existsSync(resolve(root, path))) errors.push(`missing-evidence:${path}`);
  for (const file of registry.boundaries) {
    const text = readFileSync(resolve(root, file), 'utf8');
    // Narrow negative guard: actual behavior tests cover typed mappings and locale updates.
    if (/set(?:Message|Error)\([^\n;]*(?:\.message\b|String\((?:e|err|error)\))/.test(text)) errors.push(`raw-exception:${file}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return registry.sites.reduce((counts, entry) => ({ ...counts, [entry.classification]: (counts[entry.classification] ?? 0) + 1 }), {});
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log('[user-help] reviewed error inventory', checkErrorBoundaries());
