// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

export function networkOrigin(candidate) {
  const url = new URL(candidate);
  if (url.protocol === 'ws:') return `http://${url.host}`;
  if (url.protocol === 'wss:') return `https://${url.host}`;
  return /^https?:$/.test(url.protocol) ? url.origin : null;
}

/** Observe the entire context, including popup first requests and workers. */
export async function observeOfflineContext(context, origin) {
  const attempts = new Set();
  const errors = [];
  const violations = [];
  const requests = new Set();
  const record = (kind, candidate) => {
    try {
      const target = networkOrigin(candidate);
      // Never retain paths, userinfo, tokens, request bodies or query strings.
      if (target && target !== origin) attempts.add(`${kind}: ${target}`);
    } catch { /* CSP may report symbolic URLs such as inline or eval. */ }
  };
  await context.exposeBinding('__offlineRecordAttempt', (_source, kind, url) => record(kind, url));
  await context.exposeBinding('__offlineRecordCsp', (_source, directive, blocked) => {
    record('csp', blocked);
    violations.push(directive);
  });
  await context.addInitScript(() => {
    const record = (kind, url) => { void window.__offlineRecordAttempt(kind, String(url)); };
    window.addEventListener('securitypolicyviolation', (event) => {
      void window.__offlineRecordCsp(event.effectiveDirective, event.blockedURI);
    });
    const Socket = window.WebSocket;
    window.WebSocket = new Proxy(Socket, {
      construct(target, args) { record('websocket', args[0]); return Reflect.construct(target, args); },
    });
    const open = window.open;
    window.open = function (url, ...rest) { if (url) record('popup', url); return open.call(this, url, ...rest); };
  });
  context.on('request', (request) => {
    record(request.resourceType(), request.url());
    try { if (networkOrigin(request.url()) === origin) requests.add(new URL(request.url()).pathname); } catch { /* local */ }
  });
  const inspectCspLog = (value) => {
    if (!/violates|violated|refused/i.test(value) || !/content security policy/i.test(value)) return;
    violations.push('console-csp');
    for (const candidate of value.match(/(?:https?|wss?):\/\/[^\s'"<>]+/g) ?? []) record('csp', candidate);
  };
  const pagesReady = new WeakMap();
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.name));
    pagesReady.set(page, (async () => {
      const session = await context.newCDPSession(page);
      session.on('Log.entryAdded', ({ entry }) => inspectCspLog(entry.text));
      await session.send('Log.enable');
    })().catch(() => { errors.push('Unable to attach the page CSP observer'); }));
  });
  // Worker CSP violations do not bubble to the document's event listener.
  // Chromium reports them through CDP Log (and sometimes the console).
  // Retain only directive/origin.
  context.on('console', (message) => inspectCspLog(message.text()));
  await context.route('**/*', (route) => {
    const target = networkOrigin(route.request().url());
    if (target && target !== origin) {
      record(route.request().resourceType(), route.request().url());
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    if (networkOrigin(socket.url()) !== origin) {
      record('websocket', socket.url());
      socket.close();
    } else socket.connectToServer();
  });
  return { attempts, errors, violations, requests, pageReady: (page) => pagesReady.get(page) };
}
