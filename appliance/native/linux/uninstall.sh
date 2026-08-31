#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$SCRIPT_DIR/runtime/node/bin/node" ]; then BUNDLE_ROOT=$SCRIPT_DIR; else BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd); fi
exec "$BUNDLE_ROOT/runtime/node/bin/node" "$BUNDLE_ROOT/runtime/manager.mjs" uninstall --bundle "$BUNDLE_ROOT" "$@"
