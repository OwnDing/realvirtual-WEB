const resultNode = document.querySelector('#results');
const summaryNode = document.querySelector('#summary');
const runButton = document.querySelector('#run');
const downloadButton = document.querySelector('#download');
let latestReport = null;

function result(id, label, level, status, code, detail, data = null) {
  return { id, label, level, status, code, detail, data };
}

function browserIdentity() {
  const ua = navigator.userAgent;
  const edge = /Edg\/(\d+)/.exec(ua);
  const chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
  const firefox = /Firefox\/(\d+)/.exec(ua);
  const safari = /Version\/(\d+).+Safari\//.exec(ua);
  if (edge) return { family: 'edge', major: Number(edge[1]) };
  if (chrome) return { family: 'chromium', major: Number(chrome[1]) };
  if (firefox) return { family: 'firefox', major: Number(firefox[1]) };
  if (safari) return { family: 'safari', major: Number(safari[1]) };
  return { family: 'unknown', major: null };
}

async function browserCheck(matrix) {
  const identity = browserIdentity();
  const support = matrix?.browsers?.[identity.family];
  if (!support || support.level !== 'full') {
    return result('browser', '浏览器版本', 'required', 'warn', 'BROWSER_DIAGNOSTIC_ONLY', `${identity.family} ${identity.major ?? 'unknown'} 不在完整创作支持矩阵内。`, identity);
  }
  const pass = Number.isInteger(identity.major) && identity.major >= support.minimumMajor;
  return result('browser', '浏览器版本', 'required', pass ? 'pass' : 'fail', pass ? 'BROWSER_SUPPORTED' : 'BROWSER_TOO_OLD', `${identity.family} ${identity.major}; minimum ${support.minimumMajor}; tested ${support.testedMajor}.`, identity);
}

function secureContextCheck() {
  const https = location.protocol === 'https:';
  const secure = window.isSecureContext === true;
  const pass = https && secure;
  return result('secure-context', 'HTTPS / Secure Context', 'required', pass ? 'pass' : 'fail', pass ? 'SECURE_CONTEXT_OK' : !https ? 'HTTPS_REQUIRED' : 'SECURE_CONTEXT_FALSE', `${location.origin} · isSecureContext=${secure}`);
}

async function certificateContextCheck() {
  const trustedContext = location.protocol === 'https:' && window.isSecureContext === true;
  try {
    const response = await fetch('/appliance/api/info', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const evidence = response.ok ? (await response.json()).certificate : null;
    const pass = trustedContext && evidence?.status === 'pass';
    return result(
      'certificate-context', '证书上下文', 'required', pass ? 'pass' : 'fail',
      pass ? 'CERT_CONTEXT_ACCEPTED' : !trustedContext ? 'CERT_CONTEXT_NOT_TRUSTED' : evidence?.code ?? 'CERTIFICATE_EVIDENCE_UNAVAILABLE',
      pass ? `secure context；${evidence.code}；有效至 ${evidence.validTo}；SHA-256 ${evidence.fingerprint256}` : '当前页面未形成受信任 secure context，或主机证书证据不可用。',
      evidence,
    );
  } catch {
    return result('certificate-context', '证书上下文', 'required', 'fail', 'CERTIFICATE_EVIDENCE_UNAVAILABLE', '无法读取主机证书证据；请同时检查主机预检输出。');
  }
}

function webglCheck() {
  const gl1 = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
  const gl2 = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  const inspect = (gl) => gl ? {
    version: gl.getParameter(gl.VERSION),
    shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxViewportDimensions: [...gl.getParameter(gl.MAX_VIEWPORT_DIMS)],
  } : null;
  const data = { webgl1: inspect(gl1), webgl2: inspect(gl2) };
  gl1?.getExtension('WEBGL_lose_context')?.loseContext();
  gl2?.getExtension('WEBGL_lose_context')?.loseContext();
  if (!gl1 && !gl2) return result('webgl', 'WebGL', 'required', 'fail', 'WEBGL_CONTEXT_FAILED', '无法创建硬件 WebGL 上下文。', data);
  return result('webgl', 'WebGL', 'required', gl2 ? 'pass' : 'fail', gl2 ? 'WEBGL2_OK' : 'WEBGL2_REQUIRED', `WebGL1=${Boolean(gl1)}; WebGL2=${Boolean(gl2)}; max texture ${data.webgl2?.maxTextureSize ?? data.webgl1?.maxTextureSize}`, data);
}

async function webgpuCheck() {
  if (!navigator.gpu) return result('webgpu', 'WebGPU', 'feature', 'unsupported', 'WEBGPU_API_MISSING', '浏览器未提供 navigator.gpu。');
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return result('webgpu', 'WebGPU', 'feature', 'warn', 'WEBGPU_ADAPTER_MISSING', 'API 存在，但没有可用 adapter。');
    const data = {
      features: [...adapter.features].sort(),
      limits: {
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
      },
    };
    return result('webgpu', 'WebGPU', 'feature', 'pass', 'WEBGPU_ADAPTER_OK', `${data.features.length} features; max texture ${data.limits.maxTextureDimension2D}`, data);
  } catch (error) {
    return result('webgpu', 'WebGPU', 'feature', 'warn', 'WEBGPU_PROBE_FAILED', error instanceof Error ? error.message : String(error));
  }
}

async function webxrCheck() {
  if (!navigator.xr) return result('webxr', 'WebXR', 'feature', 'unsupported', 'WEBXR_API_MISSING', '浏览器或设备未提供 navigator.xr。');
  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);
  const supported = vr || ar;
  return result('webxr', 'WebXR', 'feature', supported ? 'pass' : 'warn', supported ? 'WEBXR_SESSION_AVAILABLE' : 'WEBXR_SESSION_UNAVAILABLE', `immersive-vr=${vr}; immersive-ar=${ar}`, { vr, ar });
}

function fsAccessCheck() {
  const openFile = typeof window.showOpenFilePicker === 'function';
  const directory = typeof window.showDirectoryPicker === 'function';
  const supported = openFile && directory;
  return result('fs-access', 'File System Access', 'authoring', supported ? 'pass' : 'warn', supported ? 'FS_ACCESS_OK' : 'FS_ACCESS_LIMITED', `showOpenFilePicker=${openFile}; showDirectoryPicker=${directory}`, { openFile, directory });
}

async function opfsCheck() {
  if (typeof navigator.storage?.getDirectory !== 'function') return result('opfs', 'OPFS 往返', 'required', 'fail', 'OPFS_API_MISSING', 'navigator.storage.getDirectory 不可用。');
  const name = `.xyvirtual-diagnostic-${crypto.randomUUID()}`;
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write('xyvirtual-opfs-check');
    await writable.close();
    const stored = await (await handle.getFile()).text();
    await root.removeEntry(name);
    const pass = stored === 'xyvirtual-opfs-check';
    return result('opfs', 'OPFS 往返', 'required', pass ? 'pass' : 'fail', pass ? 'OPFS_ROUNDTRIP_OK' : 'OPFS_CONTENT_MISMATCH', pass ? '写入、读取和删除成功。' : '读取内容与写入内容不一致。');
  } catch (error) {
    return result('opfs', 'OPFS 往返', 'required', 'fail', 'OPFS_ROUNDTRIP_FAILED', error instanceof Error ? error.message : String(error));
  }
}

async function storageCheck() {
  try {
    const persisted = typeof navigator.storage?.persisted === 'function' ? await navigator.storage.persisted() : null;
    const estimate = typeof navigator.storage?.estimate === 'function' ? await navigator.storage.estimate() : {};
    return result('storage', '浏览器存储', 'advisory', persisted ? 'pass' : 'warn', persisted ? 'STORAGE_PERSISTED' : 'STORAGE_EVICTABLE', `persistent=${persisted}; usage=${estimate.usage ?? 'unknown'}; quota=${estimate.quota ?? 'unknown'}`, { persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null });
  } catch (error) {
    return result('storage', '浏览器存储', 'advisory', 'warn', 'STORAGE_PROBE_FAILED', error instanceof Error ? error.message : String(error));
  }
}

async function applianceCheck() {
  try {
    const response = await fetch('/health/ready', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    return result('appliance', 'Appliance 服务', 'required', response.ok ? 'pass' : 'fail', response.ok ? 'APPLIANCE_READY' : 'APPLIANCE_NOT_READY', `${data.status}; ${data.checks?.length ?? 0} checks`, data.checks ?? null);
  } catch (error) {
    return result('appliance', 'Appliance 服务', 'required', 'fail', 'APPLIANCE_UNREACHABLE', error instanceof Error ? error.message : String(error));
  }
}

async function websocketCheck(WebSocketImpl = WebSocket) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${location.host}/connect/webviewer`;
  return new Promise((resolvePromise) => {
    let settled = false;
    let socket;
    const finish = (status, code, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(1000, 'diagnostic complete'); } catch { /* best effort close */ }
      resolvePromise(result('websocket', 'CONNECT WSS', 'required', status, code, detail));
    };
    const timer = setTimeout(() => finish('fail', 'WSS_TIMEOUT', '同源 CONNECT WebSocket 握手超时。'), 3000);
    try {
      socket = new WebSocketImpl(endpoint);
      socket.addEventListener('open', () => finish(protocol === 'wss:' ? 'pass' : 'fail', protocol === 'wss:' ? 'WSS_OK' : 'WSS_REQUIRED', `${protocol}//${location.host}/connect/webviewer`), { once: true });
      socket.addEventListener('error', () => finish('fail', 'WSS_HANDSHAKE_FAILED', '同源 CONNECT WebSocket 握手失败。'), { once: true });
    } catch (error) {
      finish('fail', 'WSS_CONSTRUCTION_FAILED', error instanceof Error ? error.message : String(error));
    }
  });
}

function serviceWorkerCheck() {
  const supported = 'serviceWorker' in navigator;
  const controlled = Boolean(navigator.serviceWorker?.controller);
  return result('service-worker', 'Service Worker', 'advisory', supported ? 'pass' : 'unsupported', supported ? 'SERVICE_WORKER_API_OK' : 'SERVICE_WORKER_UNSUPPORTED', `supported=${supported}; controlled=${controlled}`, { supported, controlled });
}

export async function runDiagnostics({ supportMatrix, WebSocketImpl } = {}) {
  const matrix = supportMatrix ?? await fetch('/diagnostics/support-matrix.json', { cache: 'no-store' }).then((response) => response.json()).catch(() => null);
  const checks = [];
  checks.push(await browserCheck(matrix));
  checks.push(secureContextCheck());
  checks.push(await certificateContextCheck());
  checks.push(webglCheck());
  checks.push(await webgpuCheck());
  checks.push(await webxrCheck());
  checks.push(fsAccessCheck());
  checks.push(await opfsCheck());
  checks.push(await storageCheck());
  checks.push(await applianceCheck());
  checks.push(await websocketCheck(WebSocketImpl));
  checks.push(serviceWorkerCheck());
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    origin: location.origin,
    userAgent: navigator.userAgent,
    checks,
    summary: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn' || check.status === 'unsupported').length,
      fail: checks.filter((check) => check.status === 'fail').length,
    },
  };
}

function render(report) {
  resultNode.replaceChildren(...report.checks.map((check) => {
    const card = document.createElement('article');
    card.className = `result ${check.status}`;
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = check.label;
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = `${check.status} · ${check.level}`;
    header.append(title, pill);
    const detail = document.createElement('p');
    detail.textContent = check.detail;
    const code = document.createElement('p');
    code.className = 'code';
    code.textContent = check.code;
    card.append(header, detail, code);
    return card;
  }));
  const { pass, warn, fail } = report.summary;
  summaryNode.textContent = `通过 ${pass} · 警告 ${warn} · 失败 ${fail}`;
  downloadButton.disabled = false;
}

async function execute() {
  runButton.disabled = true;
  downloadButton.disabled = true;
  summaryNode.textContent = '正在检查…';
  resultNode.replaceChildren();
  latestReport = await runDiagnostics();
  render(latestReport);
  runButton.disabled = false;
}

runButton?.addEventListener('click', execute);
downloadButton?.addEventListener('click', () => {
  if (!latestReport) return;
  const blob = new Blob([`${JSON.stringify(latestReport, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xyvirtual-environment-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

if (resultNode && runButton) execute();
