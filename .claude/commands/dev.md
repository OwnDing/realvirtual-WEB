---
description: "Start the realvirtual WEB dev server"
allowed-tools: Bash(*)
---

# Dev Server

Start the Vite dev server with HMR.

## Task

1. Inspect the intended port without changing any process:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null || true
```

If the port is occupied, identify the command and working directory. Reuse a healthy
realvirtual WEB server when appropriate. Otherwise report the conflict or select an
explicit alternate port for this task. Never terminate all Node.js processes and never
stop a process that this task did not start.

2. Start the dev server in an agent-managed background session:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Record the command, working directory, port and exact child PID/session. Stop only that
recorded process when cleanup is requested. The server runs on `localhost:5173` unless
an alternate port was explicitly selected.
