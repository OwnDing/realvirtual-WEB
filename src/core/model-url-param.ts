// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Resolve the `?model=` boot parameter against the discovered model catalogue.
 *
 * `?model=` used to be taken raw. A bare filename such as
 * `?model=DemoRealvirtualWeb.glb` was therefore fetched relative to the page
 * (`/DemoRealvirtualWeb.glb`), which every deployment of this build answers with
 * the SPA fallback page, so the boot failed with "Model could not be loaded" —
 * including from the product's own welcome dialog link. It was also the one boot
 * path that skipped the catalogue resolution every other path performs
 * (`doc-persistence.md`, the `baseKeyOf` identity table).
 *
 * Only a BARE filename that names a catalogue entry is rewritten, to that
 * entry's URL. Paths, absolute URLs and unknown names are returned unchanged, so
 * a deployment that really serves a file at that location keeps working.
 */
export interface CatalogueEntry {
  readonly filename: string;
  readonly url: string;
}

export function resolveModelUrlParam(value: string, entries: readonly CatalogueEntry[]): string {
  const bare = value.trim();
  if (bare === '' || /[/\\:?#]/.test(bare)) return value;
  return entries.find((entry) => entry.filename === bare)?.url ?? value;
}
