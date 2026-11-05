// Bundles the server + shared domain into dist/server.js. npm packages stay external (installed on the VM).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.js',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});
