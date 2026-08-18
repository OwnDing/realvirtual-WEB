---
description: "Run type-check and all tests"
allowed-tools: Bash(*)
---

# Test Command

Run the repository's governed comprehensive verification entry.

## Task

1. Read `AGENTS.md` and the Harness rules.

2. Run:
```bash
./scripts/verify.sh all
```

3. Report every gate that ran, failures/warnings, and explicitly note that `all` does
   not include Playwright E2E, real PLC/device, CONNECT, WebXR or manual UX validation.
