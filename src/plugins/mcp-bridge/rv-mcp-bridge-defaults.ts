// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Small, dependency-free defaults shared by the eager settings UI and the
 * lazy MCP bridge implementation.
 *
 * Keep value constants used by eager React hooks here. Importing them from the
 * plugin entry point folds the complete bridge and its embedded help text back
 * into the startup chunk.
 */
export const DEFAULT_BRIDGE_PORT = '5100';
