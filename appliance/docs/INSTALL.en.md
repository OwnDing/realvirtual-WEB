# XYvirtual Offline Appliance installation

The authoritative installation runbook is `INSTALL.zh-CN.md`. This English handover summary covers
the same safety-critical sequence: assign stable app and Influx DNS names, choose customer PKI or
the offline internal CA, copy `config/appliance.example.json` to a protected path **outside the
extracted bundle**, run the
target package's `preflight` script, and then run `install` with `--mode container` or `--mode native`.
Adding a customer config inside the bundle is correctly rejected as an undeclared-file integrity
failure.

No installation or upgrade command downloads packages or images. Container mode requires a
customer-managed Docker/Podman installation and loads only `images/appliance-images.tar` with pull
disabled. Native mode uses the signed runtimes inside `runtime/` plus one host prerequisite: `git`
(Git for Windows on Windows), which Forgejo calls at run time and the archive does not contain;
preflight blocks a native install without it. Container mode uses the git inside the Forgejo image.

After installation, trust the internal CA root through an approved out-of-band GPO/MDM/manual
process, verify its SHA-256 fingerprint, and open `/diagnostics/` from a real operator device. HTTPS,
secure context, WebGL2, OPFS round trip, release integrity, the industrial gateway (and CONNECT when
the release includes it), Forgejo and InfluxDB are the baseline checks. File System Access, WebGPU and WebXR are feature-scoped.

Always run `backup` before `upgrade`. `rollback` switches to the retained release without deleting
shared data. `uninstall` preserves state unless the exact install id is supplied with the explicit
purge flags. Never bypass a certificate warning, disable TLS validation, expose CONNECT/PLC ports,
or change scheme/host/port during an ordinary upgrade.

From this release the HMI requires a personal account (unauthenticated requests are sent to
`/login/`); `/appliance/`, `/diagnostics/` and `/git/` keep the shared operator credential. When no
HMI administrator exists, the installer creates one from the operator credential; sign in, create
personal accounts (viewer, operator, engineer, administrator) in `/present/`, and change that
password. The access database is format 2: rolling back to an earlier release requires restoring the
consistency backup.

The first install writes `config/gateway.json` as a **read-only, unconfigured** gateway. The
customer's OT owner fills in the OPC UA `source` and the explicit `signals` mapping per
`docs/contracts/GATEWAY.md`, then restarts the gateway service; upgrades keep the file. Writes stay
off unless a `PLCInput*` signal is marked `writable` and `readOnly` is set to `false` after site
authorization. Every write attempt is audited in `state/data/gateway/audit/writes.jsonl`; a timed-out
write is `unknown` and is never retried automatically. Real controllers require their own on-site
acceptance.

Browser, hardware and trust acceptance: [L3-2 guide](BROWSER_SUPPORT.md). Hand-over acceptance:
[field acceptance checklist](FIELD_ACCEPTANCE.en.md), with the read-only probe `acceptance/probe.mjs`.
