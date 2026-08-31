const summary = document.querySelector('#summary');
const checks = document.querySelector('#checks');
const links = document.querySelector('#links');

function render(data) {
  summary.textContent = `整体状态：${data.status} · 版本 ${data.version}`;
  summary.className = `summary ${data.status}`;
  checks.replaceChildren(...data.checks.map((check) => {
    const card = document.createElement('article');
    card.className = 'card';
    const title = document.createElement('h2');
    title.textContent = check.id;
    const state = document.createElement('p');
    state.className = `status ${check.status}`;
    state.textContent = check.status;
    const detail = document.createElement('dl');
    for (const [label, value] of [
      ['Code', check.code], ['Required', check.required ? 'yes' : 'no'], ['Duration', `${check.durationMs ?? '—'} ms`],
    ]) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = String(value);
      detail.append(term, description);
    }
    card.append(title, state, detail);
    return card;
  }));
}

function renderLinks(urls) {
  const labels = { web: '打开 WEB', git: '项目 Git', connectHealth: 'CONNECT 健康', influx: 'InfluxDB', diagnostics: '环境检查' };
  links.replaceChildren(...Object.entries(labels).flatMap(([id, label]) => {
    if (typeof urls?.[id] !== 'string') return [];
    const anchor = document.createElement('a');
    anchor.href = urls[id];
    anchor.textContent = label;
    return [anchor];
  }));
}

Promise.all([
  fetch('/appliance/api/status', { cache: 'no-store' }).then((response) => response.json()),
  fetch('/appliance/api/info', { cache: 'no-store' }).then((response) => response.json()),
])
  .then(([status, info]) => { render(status); renderLinks(info.urls); })
  .catch(() => {
    summary.textContent = '无法读取 Appliance 健康状态。';
    summary.className = 'summary failed';
  });
