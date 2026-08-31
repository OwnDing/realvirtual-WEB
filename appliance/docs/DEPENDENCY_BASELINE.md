# Offline Appliance dependency baseline — 2026-08-30

This baseline is intentionally versioned. Release engineering must resolve every tag to the
platform-specific immutable manifest digest, verify upstream signatures/checksums, and record the
resolved digest in the dependency lock. Floating `latest`, major-only, and minor-only tags are not
release inputs.

| Component | Selected version | Rationale | Declared license |
| --- | --- | --- | --- |
| Node.js | 24.20.0 (Krypton LTS) | Current production LTS; 26.x is Current, not LTS | MIT plus bundled third-party notices |
| Caddy | 2.11.4 | Current stable patch release | Apache-2.0 |
| Forgejo | 15.0.7 LTS | Supported LTS until 2027-07-15; prefer LTS over 16.x for an offline appliance | GPL-3.0-or-later plus bundled notices |
| InfluxDB OSS | 2.9.1 | Latest 2.x line compatible with the Appliance v2 API, Flux, UI, backup and setup contracts | MIT |
| influx CLI | 2.8.0 | Current CLI release for InfluxDB OSS v2 | MIT |
| WinSW | 2.12.0 | Current stable 2.x Windows service wrapper | MIT |

## Container inputs

- Edge: `caddy:2.11.4-alpine`.
- Control plane: `node:24.20.0-bookworm-slim`.
- CONNECT: `debian:12-slim`, subject to the official CONNECT ELF dynamic-library report. Debian 12
  is selected for conservative glibc compatibility; do not use Alpine for a glibc-linked CONNECT.
- Forgejo: `codeberg.org/forgejo/forgejo:15.0.7`.
- InfluxDB: `influxdb:2.9.1`. Never use `latest`; that tag is scheduled to move to InfluxDB 3.

The multi-architecture index digest is not interchangeable with a child manifest digest. The lock
for `linux-x64` and `linux-arm64` must record the digest actually inspected for that platform.

## CONNECT release recommendation

CONNECT is a product component, not a replaceable open-source utility. Use vendor-produced,
version-matched artifacts from the same CONNECT source revision:

- `realvirtual-Connect-linux-x64`: ELF64, x86-64, executable, preferably self-contained or built on
  glibc no newer than Debian 12; publish SHA-256, build revision, dependency report and signature.
- `realvirtual-Connect-linux-arm64`: ELF64, AArch64 with the same protocol/build revision and
  evidence; it must be a native build, not an x64 binary under emulation.
- `realvirtual-Connect-windows-x64.exe`: PE32+ AMD64, Authenticode-signed, with the same protocol and
  build revision; publish SHA-256 and signer identity.

Do not substitute Wine, QEMU, a WebSocket mock, or the public Windows executable for a Linux
release. A test double may validate orchestration only and must carry `testFixture: true`; it cannot
produce a formal bundle.

## Notice and source obligations

The files under `appliance/licenses/third-party/` are release notices, not a complete legal
handover. Release engineering must also copy the exact upstream license files, image/package SBOM,
and any required corresponding source or approved source offer. Forgejo 15 is GPLv3-or-later, so a
redistributed binary/image requires particular source-availability review.
