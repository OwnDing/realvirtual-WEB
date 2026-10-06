// SPDX-License-Identifier: AGPL-3.0-only
// Local, explicit administration; credentials arrive via protected stdin, never argv.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessStore, hashPassword, requireValue } from './store.mjs';

export async function administer(root, input) {
  const store = new AccessStore(root);
  try {
    if (input.action === 'create') return await store.createUser(input.username, input.password, input.role ?? 'admin');
    if (input.action === 'reset') {
      const user = store.get('SELECT id FROM users WHERE username=?', String(input.username).toLowerCase());
      requireValue(user, 404, 'NOT_FOUND');
      const password = await hashPassword(input.password);
      store.transaction(() => {
        store.run('UPDATE users SET password=?,disabled=0 WHERE id=?', password, user.id);
        store.run('DELETE FROM sessions WHERE user=?', user.id); store.audit('local-cli', 'user.reset', user.id);
      });
      return { id: user.id, reset: true };
    }
    throw new Error('Unsupported action');
  } finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node admin.mjs <access-data-directory>; JSON input on stdin');
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 16384) throw new Error('Input too large'); }
    await administer(resolve(process.argv[2]), JSON.parse(input));
    console.log('Access account updated.');
  } catch { console.error('Access account update failed. Check action, username, password policy and data directory.'); process.exitCode = 1; }
}
