// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// A separate public payload: no customer public/ files, model catalog, workspace or industrial UI.
export default defineConfig({
  root: resolve(__dirname, 'src/access'), base: '/present/', publicDir: false,
  plugins: [react(), { name: 'access-draco', generateBundle() {
    for (const name of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) this.emitFile({ type: 'asset', fileName: `draco/${name}`, source: readFileSync(resolve(__dirname, 'node_modules/three/examples/jsm/libs/draco/gltf', name)) });
  } }],
  resolve: { alias: { '@rv-private': resolve(__dirname, 'src/private-stubs'), '@rv': resolve(__dirname, 'src') } },
  define: { __RV_HAS_PRIVATE__: 'false', __RV_INTERNAL__: 'false', __RV_COMMERCIAL__: 'false', __RV_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version) },
  worker: { format: 'es' },
  build: { target: 'esnext', outDir: resolve(__dirname, 'dist/present'), emptyOutDir: true, sourcemap: false, rollupOptions: { output: { banner: '/*! @license XYvirtual WEB | AGPL-3.0-only | Copyright (C) realvirtual GmbH */' } } },
});
