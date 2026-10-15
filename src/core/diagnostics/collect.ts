// SPDX-License-Identifier: AGPL-3.0-only
import { getLogBuffer, getLogBufferStats } from '../engine/rv-debug';
import { RV_VERSION } from '../rv-version';
import { projectLog, numberOrNull } from './sanitize';
import { abortIfNeeded, DIAGNOSTIC_LIMITS, section, type DiagnosticOptions, type DiagnosticReport, type Section, type Json } from './types';
import { diagnosticSession, type DiagnosticSession } from './session';

export function collectEnvironment(): Section {
  const ua = navigator.userAgent;
  const match = ua.match(/(Edg|Firefox|Chrome|Version)\/(\d+(?:\.\d+){0,3})/);
  const edge = ua.match(/Edg\/(\d+(?:\.\d+){0,3})/);
  const browser = edge ? 'Edge' : match ? ({ Chrome: 'Chromium', Firefox: 'Firefox', Version: 'Safari', Edg: 'Edge' } as Record<string, string>)[match[1]] : 'unknown';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';
  return section('ok', 'ENVIRONMENT_COLLECTED', {
    version: { version: RV_VERSION.version, webBuild: RV_VERSION.webBuild, commit: RV_VERSION.commit, buildDate: RV_VERSION.buildDate }, browser, browserVersion: edge?.[1] ?? match?.[2] ?? null, os,
    locale: document.documentElement.lang === 'en-US' ? 'en-US' : 'zh-CN', secureContext: isSecureContext,
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio, hardwareConcurrency: numberOrNull(navigator.hardwareConcurrency),
    apis: { webgpu: 'gpu' in navigator, webxr: 'xr' in navigator, filePicker: 'showOpenFilePicker' in window, opfs: typeof navigator.storage?.getDirectory === 'function', serviceWorker: 'serviceWorker' in navigator },
  });
}
/** Deadline bounds waiting; signal reaches cooperative collectors. Never serialize exception text. */
export async function collectSection(work: (signal: AbortSignal) => Section | Promise<Section>, signal: AbortSignal, timeoutMs: number = DIAGNOSTIC_LIMITS.timeoutMs): Promise<Section> {
  abortIfNeeded(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void = () => {};
  const interruption = new Promise<Section>((resolve, reject) => {
    onAbort = () => { controller.abort(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); resolve(section('timeout', 'COLLECTION_TIMEOUT')); }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)).catch(() => section('failed', 'COLLECTION_FAILED')), interruption]);
  } finally { clearTimeout(timer!); signal.removeEventListener('abort', onAbort); controller.abort(); }
}
export async function collectReport(options: DiagnosticOptions, signal: AbortSignal, session: DiagnosticSession = diagnosticSession): Promise<DiagnosticReport> {
  abortIfNeeded(signal);
  const source = session.getSource(), generation = source?.generation();
  const events = session.snapshot();
  const logStats = getLogBufferStats();
  const logs = options.logs ? [...getLogBuffer().slice(-DIAGNOSTIC_LIMITS.logs).map(e => projectLog(e, location.origin)), ...events.events].sort((a, b) => a.timestamp - b.timestamp) : [];
  const [environment, graphics, initialScene] = await Promise.all([
    collectSection(() => collectEnvironment(), signal),
    collectSection(() => source?.graphics() ?? section('unavailable', 'VIEWER_UNAVAILABLE'), signal),
    options.scene ? collectSection(s => source?.scene(s) ?? section('unavailable', 'VIEWER_UNAVAILABLE'), signal) : Promise.resolve(section('excluded', 'SCENE_EXCLUDED')),
  ]);
  abortIfNeeded(signal);
  const scene = options.scene && (source !== session.getSource() || generation !== source?.generation()) ? section('changed', 'SCENE_CHANGED') : initialScene;
  const omissions = { freeText: logs.filter(log => log.omitted).length, eventOverflow: options.logs ? events.overflow : 0, logOverflow: options.logs ? logStats.overwritten : 0, byteLimit: 0 };
  return {
    manifest: {
      kind: 'xyvirtual-diagnostic-bundle', schemaVersion: 1, redactionVersion: 1,
      id: crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      generatedAt: new Date().toISOString(), options: { logs: options.logs === true, scene: options.scene === true },
      logRange: { from: logs[0]?.timestamp ?? null, to: logs.at(-1)?.timestamp ?? null, count: logs.length },
      omissions, notices: options.logs ? [] : ['LOGS_EXCLUDED'], files: [],
    }, environment, graphics, scene, logs,
  };
}
/** Explicit numeric projection; never spread renderer statistics or runtime bags. */
export function numbers(source: object, keys: readonly string[]): Record<string, Json> {
  const input = source as Record<string, unknown>;
  return Object.fromEntries(keys.map(key => [key, numberOrNull(input[key])]));
}
