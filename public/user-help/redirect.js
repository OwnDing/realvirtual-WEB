// SPDX-License-Identifier: AGPL-3.0-only
(() => {
  const locale = new URLSearchParams(location.search).get('lang') === 'en-US' ? 'en-US' : 'zh-CN';
  const { base, topic } = document.body.dataset;
  location.replace(`${base}${locale}/${topic}/index.html${location.hash}`);
})();
