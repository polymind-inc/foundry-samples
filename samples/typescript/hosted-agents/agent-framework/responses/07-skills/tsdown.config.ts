import { defineConfig } from 'tsdown';

// Builds one self-contained ESM bundle so the runtime image only needs dist/main.mjs.
// The skills/ directory is NOT bundled — the Dockerfile copies it into the image separately.
export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  clean: true,
  treeshake: true,
  sourcemap: true,
  dts: false,
  outputOptions: { codeSplitting: false },
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
  outExtensions: () => ({ js: '.mjs' }),
});
