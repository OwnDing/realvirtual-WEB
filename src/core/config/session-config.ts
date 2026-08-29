// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { CONFIG_ID_RE, type UnifiedConfigValues } from './unified-config';

function sessionBoolean(value: string | null): boolean | undefined {
  if (value === '1' || value === 'true' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'off') return false;
  return undefined;
}

/** Parse only explicitly approved session keys; everything else is inert. */
export function parseSessionConfig(params: URLSearchParams): UnifiedConfigValues {
  const result: UnifiedConfigValues = {};
  const locale = params.get('locale') ?? params.get('lang');
  if (locale === 'zh-CN' || locale === 'en-US') result.locale = locale;
  const mode = params.get('mode');
  if (mode && CONFIG_ID_RE.test(mode)) result.workspace = { default: mode };
  const features: Record<string, boolean> = {};
  for (const [key, raw] of params) {
    if (!key.startsWith('feature.')) continue;
    const id = key.slice('feature.'.length);
    const enabled = sessionBoolean(raw);
    if (CONFIG_ID_RE.test(id) && enabled !== undefined) features[id] = enabled;
  }
  if (Object.keys(features).length > 0) result.features = features;
  return result;
}
