# Building a formal offline appliance

This is a release-engineering procedure, not a customer-host procedure. A formal package is built
only from approved target binaries and already-loaded, digest-pinned base images. The build has no
`latest` fallback and never substitutes a test fixture.

Use the dated selections and legal caveats in `DEPENDENCY_BASELINE.md`; resolve tags again for each
target and record their immutable child-manifest digests rather than copying a digest across
architectures.

## 1. Prepare locked container images

For Linux targets, create a base-image lock whose `edge`, `control`, `connect`, `forgejo`, and
`influxdb` values are local image references ending in `@sha256:<64 lowercase hex>`. `edge` must
contain Caddy, `control` must contain the selected Node LTS and its non-root `node` account, and
`connect` must be a minimal Linux base capable of the Dockerfile's offline `RUN` step.

Run the image builder with the real target CONNECT ELF and its separately approved digest:

```bash
node scripts/build-appliance-images.mjs \
  --target linux-x64 \
  --base-lock /release-input/linux-x64-base-images.json \
  --connect /release-input/realvirtual-Connect-linux-x64 \
  --connect-sha256 <approved-sha256> \
  --output /release-input/linux-x64/images/appliance-images.tar
```

The builder verifies that every base image already exists locally, disables pulls and build
networking, checks the CONNECT ELF architecture, builds the three XYvirtual images, retags the
locked Forgejo and InfluxDB images to the bundle version, and writes one OCI/Docker archive.
Windows container packages consume the `linux-x64` image archive because their service containers
run in the Linux Docker/WSL backend; Windows CONNECT remains a native service.

## 2. Assemble target dependency input

Create one dependency directory and schema-version-1 lock as documented in
`appliance/dependencies/README.md`. Include the complete target Node tree and dynamic libraries,
Caddy, CONNECT, Forgejo, InfluxDB server and CLI, WinSW on Windows, the image archive for container
mode, and every declared third-party license/notice file. Every ordinary input file must have an
exact byte length and SHA-256 declaration; undeclared extras are rejected.

Do not use the public Windows CONNECT artifact for Linux. A Linux package requires an approved
Linux CONNECT release for the exact architecture. Missing `linux-x64` or `linux-arm64` CONNECT is a
release blocker.

## 3. Build and verify the transport archive

```bash
npm run build:appliance -- \
  --target linux-x64 \
  --dependency-root /release-input/linux-x64 \
  --dependency-lock /release-input/linux-x64.json
```

Repeat for `linux-arm64` and `windows-x64`. The default output contains both `container` and
`native` modes and is named `artifacts/xyvirtual-web-appliance-<version>-<target>.tar.gz`. The
builder first runs the normal production WEB build, emits separate CycloneDX WEB/runtime SBOMs,
copies license evidence, writes an exact file inventory plus manifest digest, and refuses an
existing output path.

Before release, unpack each archive into a fresh directory and run its read-only preflight on the
matching clean target host. Then complete the real-host matrix in `PS-APPLIANCE-001`: offline Linux
container smoke, Linux native, Windows container, Windows native, customer certificate, internal
CA trust, failed upgrade recovery, backup/restore, reboot recovery, browser diagnostics, real
CONNECT traffic, and zero-egress observation. Record the archive SHA-256 and evidence in the active
ExecPlan; automated fixture tests are not formal package evidence.
