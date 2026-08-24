// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

export interface BrowserGateCommand {
  label: string;
  command: string;
  args: string[];
}

export const BROWSER_SHARDS: readonly string[];
export const PERFORMANCE_TEST: string;
export const BROWSER_PROCESS_ENV: Readonly<Record<string, string>>;
export function buildBrowserGateCommands(): BrowserGateCommand[];
export function runBrowserGate(): Promise<void>;
