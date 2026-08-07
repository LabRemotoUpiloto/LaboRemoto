import { test, expect } from '@playwright/test';

/**
 * E2E del protocolo versionado (Fase F.2 del REFACTOR #1).
 *
 * Estas pruebas requieren la app Tauri corriendo (`tauri dev` /
 * `tauri build` + ejecutable) para que exista el puente IPC
 * (`window.__TAURI_INTERNALS__`) que resuelve `invoke()`. Contra un simple
 * `vite dev` en el navegador ese puente no existe, por lo que el flujo real
 * de conexión SSH no puede completarse; en ese caso las pruebas se saltan
 * explícitamente en lugar de fallar en falso.
 *
 * Para ejecutarlas de verdad en CI:
 *   1. Levantar la app empaquetada (`cargo tauri dev` o el binario de release).
 *   2. Tener un host SSH de pruebas accesible (usar variables de entorno
 *      E2E_SSH_HOST / E2E_SSH_PORT / E2E_SSH_USER / E2E_SSH_PASSWORD).
 *   3. Ejecutar `npm run test:e2e`.
 */

const hasTauriBridge = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => Boolean((window as any).__TAURI_INTERNALS__));

test.describe('Protocol Versioning E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should connect via SSH with protocol wrapper', async ({ page }) => {
    test.skip(!(await hasTauriBridge(page)), 'Requiere runtime Tauri (invoke IPC) para ejecutarse.');

    const host = process.env.E2E_SSH_HOST ?? 'localhost';
    const port = process.env.E2E_SSH_PORT ?? '22';
    const user = process.env.E2E_SSH_USER ?? 'testuser';
    const password = process.env.E2E_SSH_PASSWORD ?? 'testpass';

    await page.getByTestId('ssh-host-input').fill(host);
    await page.getByTestId('ssh-port-input').fill(port);
    await page.getByTestId('ssh-user-input').fill(user);
    await page.getByTestId('ssh-password-input').fill(password);

    await page.getByTestId('ssh-connect-button').click();

    // El backend responde con CommandResponse<SshConnectResponse>; la UI
    // debe exponer el session_id resultante para validar el flujo E2E.
    await expect(page.getByTestId('session-id')).toContainText(/^[a-f0-9-]{36}$/);
  });

  test('should handle version mismatch error', async ({ page }) => {
    test.skip(!(await hasTauriBridge(page)), 'Requiere runtime Tauri (invoke IPC) para ejecutarse.');

    // Simula un CommandRequest con una versión de protocolo no soportada por
    // el backend; se espera que la UI muestre una notificación de error de
    // versión (CommandError::VersionMismatch) en vez de colgarse.
    await page.evaluate(async () => {
      const { commandClient } = await import('/src/services/command.service.ts');
      try {
        await commandClient.invoke('ssh_connect', { host: 'x', port: 22, user: 'x', password: 'x', cols: 80, rows: 24 }, { version: '99.0', retries: 0 });
      } catch {
        // Se espera el rechazo; la UI debería haber mostrado la notificación.
      }
    });

    await expect(page.getByTestId('notification-error')).toBeVisible();
  });

  test('should retry on transient error', async ({ page }) => {
    test.skip(!(await hasTauriBridge(page)), 'Requiere runtime Tauri (invoke IPC) para ejecutarse.');

    // Con un host inalcanzable configurado para simular timeout, el
    // CommandClient debe reintentar automáticamente antes de reportar error
    // final al usuario.
    const start = Date.now();
    await page.getByTestId('ssh-host-input').fill('10.255.255.1'); // no enrutable
    await page.getByTestId('ssh-connect-button').click();

    await expect(page.getByTestId('notification-error')).toBeVisible({ timeout: 20_000 });
    // Con reintentos + backoff exponencial, el flujo debe tardar más que una
    // única llamada fallida instantánea.
    expect(Date.now() - start).toBeGreaterThan(1000);
  });
});
