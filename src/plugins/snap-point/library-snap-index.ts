// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * library-snap-index — Lazy snap-point index for library assets.
 *
 * On first request for a (typeId, oppositeDirCode) pair, walks all known
 * library catalog entries, loads each GLB once via GLTFLoader, parses snap
 * names, and caches the result in memory + localStorage.
 *
 * Cache key: `rv-snap-index-v3:<glbUrl>`
 * Cache TTL: implicit (forever) unless invalidated by the caller; manual
 * clear via `clearCache()` for tests.
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { LibraryCatalogEntry } from '../layout-planner/rv-layout-store';
import {
  flowsCompatible,
  type SnapDirection,
  type SnapDirectionCode,
  type SnapFlow,
} from './snap-name-parser';
import {
  resolveAssemblyPort,
  type AssemblyPortDirectionTuple,
  type AssemblyPortIdentitySource,
} from './assembly-port';

export interface LibraryAssetSnapEntry {
  /** Library catalog entry id. */
  catalogId: string;
  /** GLB URL the snap belongs to. */
  glbUrl: string;
  /** Snap point inside the asset. */
  snaps: Array<{
    nodeName: string;
    portId: string;
    identitySource: AssemblyPortIdentitySource;
    localDirection?: AssemblyPortDirectionTuple;
    dir: SnapDirection;
    typeId: string;
    flow: SnapFlow;
  }>;
}

// v3 adds stable PortId/source/direction. v1/v2 caches lack that identity and
// must never be reused for placement selection.
const LS_PREFIX = 'rv-snap-index-v3:';
const _memoryCache = new Map<string, LibraryAssetSnapEntry>();
let _loader: GLTFLoader | null = null;
let _dracoLoader: DRACOLoader | null = null;

function _getLoader(): GLTFLoader {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  _dracoLoader = new DRACOLoader();
  _dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  _loader.setDRACOLoader(_dracoLoader);
  return _loader;
}

function _readLocalStorage(glbUrl: string): LibraryAssetSnapEntry | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + glbUrl);
    if (!raw) return null;
    return JSON.parse(raw) as LibraryAssetSnapEntry;
  } catch {
    // Corrupt entry — drop it
    try { localStorage.removeItem(LS_PREFIX + glbUrl); } catch { /* ignore */ }
    return null;
  }
}

function _writeLocalStorage(glbUrl: string, entry: LibraryAssetSnapEntry): void {
  try {
    localStorage.setItem(LS_PREFIX + glbUrl, JSON.stringify(entry));
  } catch {
    /* quota — silently skip; memory cache still holds it */
  }
}

/** Ensure the index for a single library entry is loaded. Idempotent. */
export async function ensureAssetIndex(
  catalogId: string,
  glbUrl: string,
): Promise<LibraryAssetSnapEntry> {
  const cached = _memoryCache.get(glbUrl);
  if (cached) return cached;
  const ls = _readLocalStorage(glbUrl);
  if (ls) {
    _memoryCache.set(glbUrl, ls);
    return ls;
  }

  const loader = _getLoader();
  const gltf = await loader.loadAsync(glbUrl);
  const snaps: LibraryAssetSnapEntry['snaps'] = [];
  const seenMetadataPortIds = new Set<string>();
  gltf.scene.traverse((node) => {
    const resolved = resolveAssemblyPort(node, glbUrl);
    if (
      resolved.kind === 'port'
      && (resolved.port.source !== 'metadata' || !seenMetadataPortIds.has(resolved.port.portId))
    ) {
      const parsed = resolved.port;
      if (parsed.source === 'metadata') seenMetadataPortIds.add(parsed.portId);
      snaps.push({
        nodeName: node.name,
        portId: parsed.portId,
        identitySource: parsed.source,
        localDirection: parsed.localDirection,
        dir: parsed.dir,
        typeId: parsed.typeId,
        flow: parsed.flow,
      });
    } else if (resolved.kind === 'invalid') {
      console.warn(`[LibrarySnapIndex] ${glbUrl}#${node.name}: ${resolved.reason}`);
    } else if (resolved.kind === 'port' && resolved.port.source === 'metadata') {
      console.warn(`[LibrarySnapIndex] ${glbUrl}: duplicate AssemblyPort.PortId '${resolved.port.portId}'`);
    }
  });
  const entry: LibraryAssetSnapEntry = { catalogId, glbUrl, snaps };
  _memoryCache.set(glbUrl, entry);
  _writeLocalStorage(glbUrl, entry);
  return entry;
}

/**
 * For a target snap, find all library entries that contain at least one
 * compatible snap. "Compatible" means:
 *   - same `typeId`
 *   - flow-compatible: in↔out, bidi↔anything; rejects in↔in / out↔out
 *
 * The axis direction code is NOT a hard filter — outward direction comes
 * from snap POSITION in the alignment math. The `preferOppositeDirCode`
 * argument is preserved for source-compat (favours the natural same-axis-
 * opposite snap when an asset exposes multiple matches), but is otherwise
 * informational.
 */
export async function findCompatibleLibraryAssets(
  entries: LibraryCatalogEntry[],
  typeId: string,
  preferOppositeDirCode?: SnapDirectionCode,
  targetFlow?: SnapFlow,
): Promise<Array<{ entry: LibraryCatalogEntry; ownPortId: string; ownSnapName: string }>> {
  const out: Array<{ entry: LibraryCatalogEntry; ownPortId: string; ownSnapName: string }> = [];
  for (const e of entries) {
    if (!e.glbUrl) continue;
    let idx: LibraryAssetSnapEntry;
    try {
      idx = await ensureAssetIndex(e.id, e.glbUrl);
    } catch {
      continue; // skip on load error
    }
    const matches = idx.snaps.filter(
      (s) => s.typeId === typeId && flowsCompatible(targetFlow, s.flow),
    );
    if (matches.length === 0) continue;
    const preferred = preferOppositeDirCode
      ? matches.find((s) => s.dir.code === preferOppositeDirCode)
      : undefined;
    const chosen = preferred ?? matches[0];
    out.push({ entry: e, ownPortId: chosen.portId, ownSnapName: chosen.nodeName });
  }
  return out;
}

/** Clear the in-memory + localStorage cache (test helper). */
export function clearCache(): void {
  _memoryCache.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

/** Direct read of in-memory cache (test helper). */
export function _getMemoryCache(): ReadonlyMap<string, LibraryAssetSnapEntry> {
  return _memoryCache;
}
