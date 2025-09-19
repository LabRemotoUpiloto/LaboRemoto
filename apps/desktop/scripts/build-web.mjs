// Cross-platform web build helper for Tauri beforeBuildCommand
// - Builds apps/desktop/web using npm
// - Uses `npm ci` when package-lock.json exists; otherwise falls back to `npm install`
// - Skips if SKIP_WEB_BUILD=1 (useful in CI when pre-building)

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// __dirname equivalent for ESM
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, '..', 'web');

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: webDir,
    stdio: 'inherit',
    shell: true // ensure npm is resolved on Windows & *nix
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (process.env.SKIP_WEB_BUILD === '1') {
  console.log('[build-web] SKIP_WEB_BUILD=1, skipping web build.');
  process.exit(0);
}

const pkgJsonPath = join(webDir, 'package.json');
if (!existsSync(pkgJsonPath)) {
  console.error('[build-web] package.json not found at', pkgJsonPath);
  process.exit(1);
}

const hasLock = existsSync(join(webDir, 'package-lock.json'));
console.log(`[build-web] Using npm ${hasLock ? 'ci' : 'install'} in ${webDir}`);
run('npm', [hasLock ? 'ci' : 'install', '--no-fund', '--no-audit']);
console.log('[build-web] Running npm run build...');
run('npm', ['run', 'build']);
console.log('[build-web] Web build completed.');
