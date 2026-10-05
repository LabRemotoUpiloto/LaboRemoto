// Empaqueta main.tsx (robot del Gemelo 3D) en dist/bundle.js usando el esbuild
// y las dependencias (three, react-three-fiber) de Cliente-Rust/frontend.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, '../../../../../Cliente-Rust/frontend');
const require = createRequire(resolve(frontend, 'package.json'));
const esbuild = require('esbuild');

mkdirSync(resolve(here, 'dist'), { recursive: true });
await esbuild.build({
  entryPoints: [resolve(here, 'main.tsx')],
  outfile: resolve(here, 'dist/bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [resolve(frontend, 'node_modules')],
  logLevel: 'info',
});
writeFileSync(resolve(here, 'dist/index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head>' +
  '<body><div id="root"></div><script src="./bundle.js"></script></body></html>');
console.log('listo: dist/index.html');
