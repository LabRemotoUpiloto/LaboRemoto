import { test, expect } from '@playwright/test';

/**
 * E2E del módulo CVA (Control por Gestos y Video Analítica).
 * Cobertura del flujo completo: Verificación → Práctica con cámara mockeada → Parada de emergencia.
 */

test.describe('CVA Gestures Module E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Inyectar script de inicialización para mockear Tauri IPC y getUserMedia antes de cargar la app
    await page.addInitScript(() => {
      // Mock de navigator.mediaDevices
      if (!(navigator as any).mediaDevices) {
        (navigator as any).mediaDevices = {};
      }
      (navigator as any).mediaDevices.enumerateDevices = async () => [
        { deviceId: 'e2e-fake-cam-1', kind: 'videoinput', label: 'Cámara E2E Fake', groupId: 'g1' }
      ];
      (navigator as any).mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#00FF00';
          ctx.fillRect(0, 0, 320, 240);
        }
        return (canvas as any).captureStream(15);
      };

      // Mock de __TAURI_INTERNALS__ e invoke
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: any) => {
          if (cmd === 'auth_status') {
            return {
              authenticated: true,
              student: { id: 1, username: 'e2e_student', fullname: 'Estudiante E2E', email: 'e2e@unipiloto.edu.co' }
            };
          }
          if (cmd === 'practicas_list_categories') {
            return [
              {
                id: 'robotica',
                name: 'Robótica y Automatización',
                description: 'Prácticas de robótica',
                icon: 'robot',
                color: 'blue',
                practices: []
              }
            ];
          }
          if (cmd === 'cva_gestures_session_start') {
            return {
              session_id: 'e2e-session-id-999',
              module_id: args?.moduleId || 'domotica',
              bridge_port: 8766,
              active: true,
            };
          }
          if (cmd === 'cva_gestures_send_frame') {
            return {
              bytes_sent: 2450,
              latency_ms: 8,
              total_frames: 42,
              fps_real: 7.0,
            };
          }
          if (cmd === 'cva_gestures_session_stop') {
            return null;
          }
          return null;
        },
        plugins: {},
      };
    });

    await page.goto('/');
  });

  test('completes full CVA flow: verification -> practice with camera mock -> practice page -> emergency stop', async ({ page }) => {
    // 1. Navegar a la sección Prácticas desde la barra lateral / menú
    const practicasLink = page.getByRole('button', { name: /Prácticas/i }).first();
    await expect(practicasLink).toBeVisible({ timeout: 10_000 });
    await practicasLink.click();

    // 2. Hacer clic en la tarjeta destacada "Video analítica"
    const cvaCard = page.getByText(/Video analítica/i).first();
    await expect(cvaCard).toBeVisible();
    await cvaCard.click();

    // 3. Selección de Módulo (Domótica)
    const domoticaMod = page.getByText(/Domótica \(Arduino\)/i).first();
    await expect(domoticaMod).toBeVisible();
    await domoticaMod.click();

    // 4. Submenú (Práctica con video personal)
    const optionBtn = page.getByText(/Práctica con video personal/i).first();
    await expect(optionBtn).toBeVisible();
    await optionBtn.click();

    // 5. Pantalla de Verificación y Consentimiento
    await expect(page.getByText(/Autorización de Video/i)).toBeVisible();
    
    // Probar cámara con stream mockeado
    const probarCamBtn = page.getByRole('button', { name: /Probar Cámara/i });
    await expect(probarCamBtn).toBeVisible();
    await probarCamBtn.click();

    // Aceptar checkbox de consentimiento
    const consentCheckbox = page.getByRole('checkbox');
    await expect(consentCheckbox).toBeVisible();
    await consentCheckbox.check();

    // Hacer clic en "Iniciar Práctica"
    const startPracticeBtn = page.getByRole('button', { name: /Iniciar Práctica/i });
    await expect(startPracticeBtn).toBeEnabled();
    await startPracticeBtn.click();

    // 6. Confirmar llegada a CVA_GesturePracticePage y visualización de métricas
    await expect(page.getByText(/Métricas de Rendimiento/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Carga CPU Cliente/i)).toBeVisible();

    // 7. Probar Parada de Emergencia
    const abortBtn = page.getByRole('button', { name: /ABORTAR Y DETENER EQUIPOS/i });
    await expect(abortBtn).toBeVisible();
    await abortBtn.click();

    await expect(page.getByText(/Parada de Emergencia Activa/i)).toBeVisible();
  });
});
