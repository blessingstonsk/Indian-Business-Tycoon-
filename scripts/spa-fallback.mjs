// GitHub Pages serves 404.html for unknown paths; mirror index.html so non-hash deep links still boot the app.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
console.log('spa-fallback: wrote dist/404.html');
