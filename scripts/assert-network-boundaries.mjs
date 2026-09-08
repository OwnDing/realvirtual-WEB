// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const constructors = new Set(['WebSocket', 'XMLHttpRequest', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker']);
const loaders = new Set(['GLTFLoader', 'DRACOLoader', 'TextureLoader', 'RGBELoader', 'PCDLoader', 'PLYLoader']);

/** An audited native sink is exact source, not a whole-file exclusion or URL blacklist. */
export function collectNetworkSinks(file, source) {
  if (file.endsWith('.html')) {
    return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
      .flatMap((match) => collectNetworkSinks(`${file}.js`, match[1]).map((sink) => ({ ...sink, file,
        line: sink.line + source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1,
      })));
  }
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sinks = [];
  const add = (node, api) => {
    const expression = node.getText(sf);
    const fingerprint = createHash('sha256').update(expression).digest('hex');
    sinks.push({ file, api, fingerprint, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, expression });
  };
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer?.getText(sf) === 'fetch') add(node, 'fetch-capability');
    if (ts.isNewExpression(node)) {
      const name = node.expression.getText(sf).split('.').pop();
      if (constructors.has(name)) add(node, name);
      if (loaders.has(name) && !node.arguments?.some((arg) => arg.getText(sf) === 'createEgressLoadingManager()')) add(node, 'unguarded-loader');
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sf);
      if (/^(?:(?:globalThis|window|self)\.)?fetch$/.test(name) || /\.fetch(?:\.bind)?$/.test(name) || name === 'fetch.bind') add(node, 'fetch');
      if (/^(?:window|globalThis|self)\.open$/.test(name)) add(node, 'navigation');
      if (/\.(?:sendBeacon|register|connectAsync)$/.test(name) && (name.includes('serviceWorker') || /sendBeacon|connectAsync/.test(name))) add(node, name.split('.').pop());
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && !ts.isStringLiteral(node.arguments[0])) add(node, 'dynamic-import');
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'fetch' && /^(globalThis|window|self)$/.test(node.expression.getText(sf))) add(node, 'fetch-capability');
    if (ts.isElementAccessExpression(node) && /fetch|WebSocket|XMLHttpRequest|sendBeacon|Worker/.test(node.argumentExpression.getText(sf))) add(node, 'computed-network-capability');
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return sinks;
}

export function inspectNetworkBoundaries(repoRoot = root) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(?:tsx?|m?js)$/.test(entry.name) && !/\.d\.(?:ts|mts)$/.test(entry.name) ? [file] : [];
  });
  const files = [...walk(resolve(repoRoot, 'src')), ...['index.html', 'teams-config.html'].map(file => resolve(repoRoot, file))];
  return files.flatMap((file) => collectNetworkSinks(relative(repoRoot, file), readFileSync(file, 'utf8')));
}

export function assertNetworkBoundaries(sinks, reviewed) {
  const key = (entry) => `${entry.file}:${entry.api}:${entry.fingerprint}`;
  const remaining = [...reviewed];
  const failures = [];
  for (const sink of sinks) {
    const index = remaining.findIndex((entry) => key(entry) === key(sink) && typeof entry.reason === 'string' && entry.reason.trim().length > 20);
    if (index < 0) failures.push(`${sink.file}:${sink.line}: unaudited ${sink.api}`);
    else remaining.splice(index, 1);
  }
  for (const stale of remaining) failures.push(`${stale.file}: stale ${stale.api} exception`);
  if (failures.length) throw new Error(failures.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sinks = inspectNetworkBoundaries();
  assertNetworkBoundaries(sinks, JSON.parse(readFileSync(resolve(root, 'scripts/network-boundary-review.json'), 'utf8')));
  console.log(`✓ network boundaries: ${sinks.length} exact native sinks audited; new sinks fail closed`);
}
