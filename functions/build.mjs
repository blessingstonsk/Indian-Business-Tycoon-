// Bundles functions + the shared domain into lib/index.js. firebase-* stay external (installed at deploy).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'lib/index.js',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-functions'],
  logLevel: 'info',
});
