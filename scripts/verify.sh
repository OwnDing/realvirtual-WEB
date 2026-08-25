#!/usr/bin/env sh
set -eu

verify_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
verify_repo_root=$(CDPATH= cd -- "${verify_script_dir}/.." && pwd)

say() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_file() {
  test -f "$1" || fail "required file not found: $1"
}

run_governance() {
  require_command node
  require_command git
  say "Governance harness self-tests"
  (
    cd "$verify_repo_root"
    node scripts/verify-governance-selftest.mjs
  )
  say "Documentation and AI-safety governance gate"
  (
    cd "$verify_repo_root"
    node scripts/verify-governance.mjs
    node scripts/assert-docs-publishable.mjs
    git diff --check
    git diff --cached --check
  )
}

run_static() {
  run_governance
  require_command npm
  require_file "$verify_repo_root/node_modules/.bin/tsc"
  say "ESLint architecture boundary gate"
  (
    cd "$verify_repo_root"
    node scripts/assert-runtime-external-origins.mjs
    npm run lint
  )
  say "Community TypeScript gate"
  (
    cd "$verify_repo_root"
    ./node_modules/.bin/tsc -p tsconfig.json --noEmit
  )
}

run_node_tests() {
  require_command npm
  require_file "$verify_repo_root/node_modules/.bin/vitest"
  say "Node test suite"
  (
    cd "$verify_repo_root"
    npm run test:node
  )
}

run_browser_tests() {
  require_command npm
  require_command node
  require_file "$verify_repo_root/node_modules/.bin/vitest"
  require_file "$verify_repo_root/scripts/run-browser-gate.mjs"
  say "Browser test suite in bounded Chromium processes"
  (
    cd "$verify_repo_root"
    node scripts/run-browser-gate.mjs
  )
}

run_build() {
  require_command npm
  require_file "$verify_repo_root/node_modules/.bin/vite"
  say "Public production build"
  (
    cd "$verify_repo_root"
    npm run build
  )
}

run_e2e() {
  require_command npm
  require_file "$verify_repo_root/node_modules/.bin/playwright"
  say "Playwright end-to-end suite"
  (
    cd "$verify_repo_root"
    npm run e2e
  )
}

usage() {
  cat <<'USAGE'
Usage: ./scripts/verify.sh [scope]

Scopes:
  governance  Harness self-tests, governed docs, AI safety and publishability
  static      governance + ESLint architecture boundary + community TypeScript
  node        Node-environment Vitest suite
  browser     Browser-mode Vitest suite
  build       Public production build
  e2e         Playwright end-to-end suite
  all         static + node + browser + build (not E2E or real-device validation)
USAGE
}

verify_scope=${1:-governance}
case "$verify_scope" in
  governance)
    run_governance
    ;;
  static)
    run_static
    ;;
  node)
    run_node_tests
    ;;
  browser)
    run_browser_tests
    ;;
  build)
    run_build
    ;;
  e2e)
    run_e2e
    ;;
  all)
    run_static
    run_node_tests
    run_browser_tests
    run_build
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    fail "unknown verification scope: $verify_scope"
    ;;
esac
