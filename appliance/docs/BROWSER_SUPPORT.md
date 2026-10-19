# Browser, workstation and trust acceptance

Read [the release matrix](SUPPORT_MATRIX.en-US.md) before making procurement commitments. The first certification targets are Windows 11 x64 Chrome/Edge. Exact minimum browser versions and physical hardware minima remain unverified until matching evidence exists. The former unbounded “Chromium/Edge 143 or newer” statement is superseded by this versioned matrix.

Supported, limited, experimental, unverified and unsupported describe product commitments. A capability check is a separate observation. Missing tests are not passes; unverified does not necessarily mean known to fail. Server OS and browser workstation support are separate.

## Workflow requirements

Standard WEB uses trusted HTTPS and WebGL2. Browser projects additionally require OPFS. Folder projects require the directory API, permission and save/reopen acceptance; file import/download and browser projects are distinct alternatives, not equivalent folder synchronization. Full Appliance acceptance also requires OPFS, service health and WSS. Single-file demos follow their separate L2-2 scope and opening method.

WebGPU is an optional experimental product path. Check the actual application backend and fallback. XR currently requires classic WebGL; certify each headset, OS/firmware, browser/runtime, VR/AR mode and input method. API presence does not validate entry, interaction or exit.

Browser extensions, Java and ActiveX are not required for standard access. Appliance runtimes, industrial gateways such as CONNECT and XR system components are separate requirements. Browser storage can be cleared or evicted; maintain recoverable project backups.

## Explicit checks

Open the environment compatibility link in Settings → Diagnostics & support, or `compatibility/index.html` under the deployment base. Appliance diagnostics links to `/diagnostics/compatibility/index.html`. Resources and the matrix work offline.

Select language, workflow and renderer, then start. The browser-project check writes, reads and deletes a dedicated random OPFS file. Folder permission selection never writes a user folder or retains a handle. Cancellation, quota, timeout and cleanup failures remain visible. Late native operations still attempt cleanup; never clear business site data to hide cleanup failures. L3-1 diagnostic export remains passive.

Download JSON explicitly and inspect it before sharing. It excludes raw user-agent text, origins, folder names, assets, credentials, signal values and arbitrary error text. Nothing is uploaded and no industrial connections are opened. Basic graphics submission and XR API checks are prerequisites, not end-to-end or performance certification.

## Intranet trust

TLS trust and the offline commercial license are separate. Prefer the enterprise CA. For internal CA, IT distributes the root through approved offline/GPO/MDM processes and verifies its SHA-256 fingerprint through another channel. Follow [the installation guide](INSTALL.en.md). Clicking through warnings or disabling certificate checks is not acceptance.

Verify DNS, time, SAN/hostname, chain, expiry and the actual workstation trust store. HTTPS uses WSS or a same-origin proxy. Browser code cannot read the certificate chain: secure context is one observation, combined with host checks and IT validation. Secure localhost HTTP does not certify production HTTPS. iframe/XR requires separate permissions-policy testing. Renew certificates without changing scheme/host/port; origin changes isolate browser storage and require explicit migration.

## Hardware and evidence

Record CPU, RAM, GPU, driver, OS/architecture, full browser version, resolution/scaling, quality, power mode and remote-desktop/VM use. Unknown fields are not inferred. Record model hash, nodes, triangles, materials, textures and bytes. Run the L2-3 reference benchmark with at least 30 samples, load latency, frame rate and resource cleanup. Software GPUs are functional evidence only. No numerical minima are published before physical acceptance.

Validate lower/upper promised browser versions, actual Chrome/Edge, folder save/close/re-authorize/reopen and denial, browser-project backup/recovery, real trusted HTTPS/WSS and negative certificate cases. For XR record exact device/firmware/browser/runtime, test entry, input, exit and re-entry. WebKit automation is not Safari certification.

Engineering runs `node scripts/verify-compatibility-production.mjs`, optionally `--channel=chrome` or `--channel=msedge`, `--hardware` and `--renderer=webgpu`. An approved installed frozen browser may use `--executable=/absolute/path/to/browser` instead of channel. Missing browsers/hardware fail rather than being certified by a skip. Reports record production digests and actual environments; they do not automatically promote support levels. IT separately verifies physical devices, production trust and enterprise policies.
