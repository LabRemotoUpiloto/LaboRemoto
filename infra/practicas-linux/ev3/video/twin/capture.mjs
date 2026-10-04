// Captura los planos del robot 3D como PNG (uno por fotograma) con Edge sin pantalla.
//   node capture.mjs <shots.json> <carpeta de salida> [--only nombre,nombre] [--size 960x600]
// shots.json: [{ "name": "brick", "scene": 1, "duration": 14.2, "params": {...} }, ...]
// Salida: <out>/<scene>/<NNNN>.png y <out>/<scene>/meta.json (puntos clave por fotograma).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, '../../../../../Cliente-Rust/frontend');
const require = createRequire(resolve(frontend, 'package.json'));
const { chromium } = require('playwright');

const [, , shotsFile, outDir, ...rest] = process.argv;
const opt = (name, def) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : def; };
const only = opt('--only', '') ? opt('--only', '').split(',') : null;
const [W, H] = opt('--size', '960x600').split('x').map(Number);
const FPS = 30;

const shots = JSON.parse(readFileSync(shotsFile, 'utf8')).filter(s => !only || only.includes(s.name));
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('[pagina]', m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('[error]', String(e).slice(0, 300)));
await page.goto(pathToFileURL(resolve(here, 'dist/index.html')).href + `?w=${W}&h=${H}`);
await page.waitForFunction(() => window.twin && window.twin.ready, null, { timeout: 30000 });

for (const s of shots) {
  const dir = resolve(outDir, String(s.scene));
  mkdirSync(dir, { recursive: true });
  const n = Math.ceil(s.duration * FPS) + 2;
  const meta = [];
  // Calentamiento: las fuentes del texto 3D se cargan de forma asíncrona.
  for (let i = 0; i < 6; i++) await page.evaluate(([a, b, c, d]) => window.twin.frame(a, b, c, d), [s.name, 0, s.duration, s.params ?? {}]);
  await page.waitForTimeout(2500);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    const r = await page.evaluate(([a, b, c, d]) => window.twin.frame(a, b, c, d), [s.name, t, s.duration, s.params ?? {}]);
    meta.push(r.points);
    await page.screenshot({ path: resolve(dir, String(f).padStart(4, '0') + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
    if (f % 60 === 0) console.log(`${s.name}: ${f}/${n}  (${((Date.now() - t0) / Math.max(1, f)).toFixed(0)} ms/fotograma)`);
  }
  writeFileSync(resolve(dir, 'meta.json'), JSON.stringify({ name: s.name, fps: FPS, size: [W, H], frames: n, points: meta }));
  console.log(`${s.name}: ${n} fotogramas en ${dir}`);
}
await browser.close();
