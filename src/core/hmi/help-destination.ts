// SPDX-License-Identifier: AGPL-3.0-only
import { getAppConfig } from '../rv-app-config';
import { allowRuntimeEgressUrl } from '../deployment/runtime-egress';
import { getLocale } from '../i18n';
import { buildHelpUrl, openExternal } from './help-url';
import type { HelpTopic } from './help-topics';
/** Preserve explicit disable, including deployments retaining a legacy docs address. */
export function configuredHelpBase(): string | undefined {
  const config = getAppConfig();
  if (config.services?.documentation === null) return undefined;
  return config.services?.documentation?.baseUrl ?? config.docs?.baseUrl;
}
export function helpDestination(topic: HelpTopic): string | undefined {
  const base = configuredHelpBase(); if (!base) return undefined;
  const allowed = allowRuntimeEgressUrl(buildHelpUrl(topic, base), 'documentation');
  if (!allowed) return undefined;
  if (allowed.origin === location.origin && /\/user-help\/$/.test(new URL(base, location.href).pathname)) allowed.searchParams.set('lang', getLocale());
  return allowed.href;
}
export function openHelpTopic(topic: HelpTopic): void { const url = helpDestination(topic); if (url) openExternal(url); }
