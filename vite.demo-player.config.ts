// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// A separate public, single-file target. The ESM embed build keeps its chunk boundaries.
export default defineConfig({
  root: __dirname, publicDir: false,
  resolve: { alias: { '@rv-private': resolve(__dirname, 'src/private-stubs'), '@rv': resolve(__dirname, 'src') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), __RV_HAS_PRIVATE__: 'false', __RV_INTERNAL__: 'false', __RV_COMMERCIAL__: 'false', __RV_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version) },
  worker: { format: 'es' },
  build: {
    target: 'es2022', outDir: resolve(__dirname, 'dist/demo-player'), emptyOutDir: true, sourcemap: false,
    lib: { entry: resolve(__dirname, 'src/demo-package/player.ts'), name: 'XYDemoPlayer', formats: ['iife'], fileName: () => 'demo-player.js' },
    rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true, banner: '/*! @license XYvirtual WEB | AGPL-3.0-only | Copyright (C) realvirtual GmbH | Corresponding source: embedded demo-player-source.zip */' } },
  },
});
