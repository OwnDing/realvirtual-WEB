# Browser and workstation acceptance

The versioned machine-readable matrix is served at `/diagnostics/support-matrix.json`. The current
release baseline is Chromium/Edge major 143 or newer and is tested with Chrome for Testing 145.
Firefox and Safari receive diagnostic-only status until equivalent automated and real-device
evidence exists.

Required on every authoring/operator workstation:

- a trusted HTTPS origin (not a clicked-through warning);
- `window.isSecureContext === true`;
- a real WebGL2 context without a major performance caveat;
- a successful OPFS write/read/delete round trip;
- a ready appliance and the expected same-origin WSS route.

File System Access is required only for folder-project workflows and currently has its complete
path on Chromium-based browsers. WebGPU and WebXR are feature gates. An API object is insufficient:
WebGPU must return an adapter, and WebXR must report the requested immersive session type. A real
headset, GPU driver, large customer model and operator policy remain manual acceptance evidence.
