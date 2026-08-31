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
disabled. Native mode uses only the signed runtimes inside `runtime/`.

After installation, trust the internal CA root through an approved out-of-band GPO/MDM/manual
process, verify its SHA-256 fingerprint, and open `/diagnostics/` from a real operator device. HTTPS,
secure context, WebGL2, OPFS round trip, release integrity, CONNECT, Forgejo and InfluxDB are the
baseline checks. File System Access, WebGPU and WebXR are feature-scoped.

Always run `backup` before `upgrade`. `rollback` switches to the retained release without deleting
shared data. `uninstall` preserves state unless the exact install id is supplied with the explicit
purge flags. Never bypass a certificate warning, disable TLS validation, expose CONNECT/PLC ports,
or change scheme/host/port during an ordinary upgrade.
