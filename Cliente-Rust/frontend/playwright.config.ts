import { defineConfig } from '@playwright/test';

/**
 * Configuración de Playwright para las pruebas E2E del protocolo versionado
 * (Fase F.2 del REFACTOR #1).
 *
 * NOTA IMPORTANTE: estas pruebas ejercitan el frontend web (Vite dev server)
 * contra un `window.__TAURI__` simulado o un backend Tauri real corriendo en
 * modo `tauri dev`. En un entorno sin Tauri ni un host SSH de prueba
 * disponible, estas specs deben ejecutarse manualmente / en CI con la app
 * empaquetada y un host SSH accesible.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
