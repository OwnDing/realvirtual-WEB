// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Compatibility re-export for extensions compiled against the former path. */
export {
  peekPendingAssetOpen,
  resetPendingAssetOpenForTests,
  setPendingAssetOpen,
  takePendingAssetOpen,
} from '../../../core/editor/pending-asset-open';
