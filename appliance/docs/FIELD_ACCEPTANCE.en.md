# XYvirtual Offline Appliance field acceptance

The authoritative checklist is [`FIELD_ACCEPTANCE.zh-CN.md`](FIELD_ACCEPTANCE.zh-CN.md); this is the
English handover summary. Record results in
[`../acceptance/FIELD_ACCEPTANCE_RECORD.template.md`](../acceptance/FIELD_ACCEPTANCE_RECORD.template.md).

**Boundaries.** CI, the in-process OPC UA test server and a simulated Unity are not field acceptance;
every item runs on the real host, network and browsers. **This checklist authorizes no PLC write**:
writes, jogs and forces (F8–F10, F12) happen only on dedicated test signals after written site
authorization and interlock/emergency-stop confirmation. The probe `acceptance/probe.mjs` is
read-only: it signs in with the accounts you give it, reads, and signs out; it never writes a
signal, jogs a drive or sends a write-class multiuser message, and its evidence holds no password,
cookie or CSRF token. Record a failure with its raw output; never reconfigure until it passes and
keep only the last run.

**Scope.** Run every delivered target × mode (`linux-x64`, `linux-arm64`, `windows-x64` ×
`container`, `native`). CONNECT is optional (ADR-0023); mark its items not applicable when absent.

**Prepare.** A host per the support matrix with stable DNS names and the customer CA (or the
approved internal CA distribution); four test accounts (viewer, operator, engineer, admin) in an
`accounts.json` kept **outside the bundle and deleted afterwards**; an OPC UA test endpoint with one
writable `PLCInput*` and one `PLCOutput*` test signal (never production signals); for multiuser, a
Unity MultiplayerWEB host and firewall access; an operator-equivalent workstation; a way to block
the Appliance's egress; an evidence folder.

**Items.** F1 archive name/version/target/SHA-256 · F2 `preflight` exits 0 · F3 install (container or
native) · F4 CA trusted with the fingerprint checked out of band, no browser warning, HTTP→HTTPS ·
F5 probe evidence with zero failed · F6 `/diagnostics/` on every terminal class · F7 gateway source and
signals configured, live values and history · F8 (authorized) operator writes a test input, audited
with user and role; a viewer has no usable write control · F9 (authorized) engineer forces and
releases, both audited · F10 alarm acknowledged by an operator, shelved by an engineer, a viewer
cannot acknowledge · F11 engineer saves a server project (Forgejo commit by that user), a viewer opens
it read-only · F12 multiuser (if delivered): `multiuser.upstream` set, Unity port 7000 reachable from
the Appliance only (a direct `ws://<unity>:7000` from the workstation fails), `probe.mjs --multiuser`
passes, a viewer joins as observer without write controls, an authorized operator jog takes effect in
Unity and is audited as `multiuser:drive_jog:…` `unknown` with the operator · F13 repeat F5–F7 with
egress blocked; the firewall log shows no outbound connection from the Appliance · F14 backup →
upgrade → rollback (or restore as instructed) → restore, accounts/projects/history/gateway config
intact after each step · F15 (test host) default uninstall keeps state, reinstall works.

**Probe.**

```bash
node acceptance/probe.mjs --url https://xyvirtual-a01.plant.example \
  --ca /path/to/root.crt --accounts /secure/accounts.json --multiuser \
  --out evidence/xyvirtual-a01-2026-11-03/probe.json
```

`--ca` is mandatory; an untrusted chain stops the probe with exit code 2 instead of skipping
validation. Drop `--multiuser` when multiuser is not delivered. Delete `accounts.json` afterwards.

**Sign-off.** Customer IT, customer OT / site lead and the vendor sign the record; the maintainers
enter the results into EP-APPLIANCE-001 and the acceptance matrix. An item not executed is recorded as
"not executed" with the reason, never as passed.
