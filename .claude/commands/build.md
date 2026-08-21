---
description: "Build production bundle"
allowed-tools: Bash(*)
---

# Build Command

Verify and build XYvirtual WEB without publishing it.

## Task

1. Read `AGENTS.md` and the Harness rules.

2. Run the governed delivery gate (it includes the public production build):
```bash
./scripts/verify.sh all
```

3. Report: output directory (`dist/`), bundle size, warnings, and any validation not
   covered by `all`. Do not deploy, upload or publish unless the user separately asks.
