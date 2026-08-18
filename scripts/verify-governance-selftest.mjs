// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual WEB contributors

import assert from 'node:assert/strict';
import {
  dangerousCommandFindings,
  expectedStatusForPath,
  extractMarkdownTargets,
  parseFrontMatter,
  validateMetadata,
} from './verify-governance.mjs';

const good = `---
doc_id: TEST-1
title: Test
status: approved
owner: qa
last_reviewed: 2026-08-18
authority: normative
---
# Test
`;

const parsed = parseFrontMatter(good);
assert.equal(parsed.metadata.doc_id, 'TEST-1');
assert.deepEqual(validateMetadata('docs/example.md', parsed.metadata), []);

assert.match(
  validateMetadata('docs/missing.md', null).join('\n'),
  /missing YAML front matter/,
);

assert.equal(expectedStatusForPath('docs/archive/old.md'), 'superseded');
assert.equal(expectedStatusForPath('docs/references/report.md'), 'reference');
assert.equal(expectedStatusForPath('docs/generated/tools.md'), 'generated');
assert.equal(expectedStatusForPath('docs/delivery/snapshots/v1.md'), 'snapshot');

const wrongArchive = { ...parsed.metadata, status: 'approved' };
assert.match(
  validateMetadata('docs/archive/old.md', wrongArchive).join('\n'),
  /requires status 'superseded'/,
);

const links = extractMarkdownTargets(`
[local](../README.md)
[web](https://example.com)
\`[sample](ignored.md)\`
\`\`\`
[fenced](ignored-too.md)
\`\`\`
`);
assert.deepEqual(links, ['../README.md', 'https://example.com']);

assert.deepEqual(dangerousCommandFindings('npm run dev'), []);
assert.match(dangerousCommandFindings('taskkill /F /IM node.exe').join('\n'), /global Windows Node termination/);
assert.match(dangerousCommandFindings('git reset --hard HEAD').join('\n'), /destructive git reset/);

console.log('✓ governance harness self-tests passed');
