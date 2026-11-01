// SPDX-License-Identifier: AGPL-3.0-only
// HMI login (ADR-0024): posts to the Appliance access service, then returns to `next`.
import { safeNext } from './next.mjs';

const TEXT = {
  'zh-CN': { title: '登录 XYvirtual WEB', hint: '使用管理员分配给你的个人账户。共享的运维账户不能登录 HMI。', username: '用户名', password: '密码', submit: '登录', denied: '用户名或密码错误，或账户已停用。', limited: '尝试次数过多，请稍后再试。', failed: '登录服务暂不可用。' },
  'en-US': { title: 'Sign in to XYvirtual WEB', hint: 'Use the personal account your administrator assigned. The shared operations account cannot sign in to the HMI.', username: 'Username', password: 'Password', submit: 'Sign in', denied: 'Wrong username or password, or the account is disabled.', limited: 'Too many attempts. Try again later.', failed: 'The sign-in service is unavailable.' },
};
const locale = (navigator.language ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
const t = TEXT[locale];
document.documentElement.lang = locale;
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t[node.dataset.i18n];
document.title = `${t.submit} · XYvirtual WEB`;


const form = document.getElementById('login');
const error = document.getElementById('error');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch('/api/access/v1/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
    });
    if (response.ok) {
      location.replace(safeNext(new URLSearchParams(location.search).get('next')));
      return;
    }
    error.textContent = response.status === 429 ? t.limited : response.status === 401 ? t.denied : t.failed;
  } catch {
    error.textContent = t.failed;
  }
  error.hidden = false;
  button.disabled = false;
  form.password.value = '';
  form.password.focus();
});
