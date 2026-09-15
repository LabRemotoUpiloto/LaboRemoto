// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import CVA_GesturesHomePage from '../../src/pages/cva-gestures/CVA_GesturesHomePage';
import CVA_VideoVerificationPage from '../../src/pages/cva-gestures/CVA_VideoVerificationPage';
import CVA_GesturePracticePage from '../../src/pages/cva-gestures/CVA_GesturePracticePage';

// Mock de @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock de @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from '@tauri-apps/api/core';

describe('CVA Gestures Components', () => {
  const mockCamera = {
    stream: null,
    active: false,
    error: null,
    devices: [],
    selectedDeviceId: null,
    setSelectedDeviceId: vi.fn(),
    startCamera: vi.fn().mockResolvedValue(null),
    stopCamera: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  describe('CVA_GesturesHomePage', () => {
    it('shows error message and retry button when error is present, and calls connect when clicked', () => {
      const mockConnect = vi.fn();
      render(
        <MantineProvider>
          <CVA_GesturesHomePage
            onSelectModule={vi.fn()}
            onBack={vi.fn()}
            error="Fallo de conexión SSH con el laboratorio (timeout de 20s)"
            connect={mockConnect}
          />
        </MantineProvider>
      );

      // Si error llega con valor, se muestra el mensaje y el botón
      expect(screen.getByText('Fallo de conexión SSH con el laboratorio (timeout de 20s)')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /Reintentar conexión/i });
      expect(retryBtn).toBeDefined();

      // Al hacer clic en el botón, se vuelve a invocar connect()
      fireEvent.click(retryBtn);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
    it('shows error message and retry button when error is present, and calls onRetry when clicked', () => {
      const mockRetry = vi.fn();
      render(
        <MantineProvider>
          <CVA_GesturesHomePage
            onSelectModule={vi.fn()}
            onBack={vi.fn()}
            error="Fallo de conexión SSH con el laboratorio (timeout de 20s)"
            onRetry={mockRetry}
          />
        </MantineProvider>
      );

      // Si error llega con valor, se muestra el mensaje y el botón
      expect(screen.getByText('Fallo de conexión SSH con el laboratorio (timeout de 20s)')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /Reintentar conexión/i });
      expect(retryBtn).toBeDefined();

      // Al hacer clic en el botón, se vuelve a invocar connect() (onRetry)
      fireEvent.click(retryBtn);
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    it('does not display error alert or retry button when error is not present', () => {
      render(
        <MantineProvider>
          <CVA_GesturesHomePage
            onSelectModule={vi.fn()}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      expect(screen.queryByText(/Error de conexión con el laboratorio/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Reintentar conexión/i })).toBeNull();
    });
  });

  describe('CVA_VideoVerificationPage', () => {
    it('disables "Iniciar Práctica" until consent checkbox is checked', () => {
      render(
        <MantineProvider>
          <CVA_VideoVerificationPage
            moduleId="domotica"
            sessionId="sess-test-123"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
            onConfirm={vi.fn()}
          />
        </MantineProvider>
      );

      const startBtn = screen.getByRole('button', { name: /Iniciar Práctica/i });
      expect((startBtn as HTMLButtonElement).disabled).toBe(true);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect((startBtn as HTMLButtonElement).disabled).toBe(false);
    });

    it('shows connection error and retry button when error is provided', () => {
      const mockRetry = vi.fn();
      render(
        <MantineProvider>
          <CVA_VideoVerificationPage
            moduleId="domotica"
            sessionId={undefined}
            camera={{ ...mockCamera, active: false }}
            error="Fallo de conexión SSH con el laboratorio"
            onRetry={mockRetry}
            onBack={vi.fn()}
            onConfirm={vi.fn()}
          />
        </MantineProvider>
      );

      expect(screen.getByText('Fallo de conexión SSH con el laboratorio')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /Reintentar conexión/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('CVA_GesturePracticePage', () => {
    it('invokes cva_gestures_session_start on mount and session_stop on unmount', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'cva_gestures_session_start') {
          return Promise.resolve({
            session_id: 'sess-test-123',
            module_id: 'domotica',
            bridge_port: 8766,
            active: true,
          });
        }
        if (cmd === 'cva_gestures_session_stop') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const { unmount } = render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-test-123"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cva_gestures_session_start', {
          sessionId: 'sess-test-123',
          moduleId: 'domotica',
        });
      });

      unmount();

      expect(invoke).toHaveBeenCalledWith('cva_gestures_session_stop', {
        sessionId: 'sess-test-123',
      });
    });

    it('triggers emergency stop and calls session_stop when ABORTAR is clicked', async () => {
      (invoke as any).mockResolvedValue({
        session_id: 'sess-test-123',
        module_id: 'domotica',
        bridge_port: 8766,
        active: true,
      });

      render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-test-123"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ABORTAR Y DETENER EQUIPOS/i })).toBeDefined();
      });

      const abortBtn = screen.getByRole('button', { name: /ABORTAR Y DETENER EQUIPOS/i });
      fireEvent.click(abortBtn);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cva_gestures_session_stop', {
          sessionId: 'sess-test-123',
        });
        expect(screen.getByText(/Parada de Emergencia Activa/i)).toBeDefined();
      });
    });
    it('handles StrictMode double mount with same sessionId and out-of-order promise resolution', async () => {
      let resolveA: (val: any) => void;
      let resolveB: (val: any) => void;
      const promiseA = new Promise((res) => { resolveA = res; });
      const promiseB = new Promise((res) => { resolveB = res; });

      let callCount = 0;
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'cva_gestures_session_start') {
          callCount++;
          return callCount === 1 ? promiseA : promiseB;
        }
        if (cmd === 'cva_gestures_session_stop') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      // Primer montaje (Mount A)
      const { rerender } = render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-strict-mode-100"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      // Segundo montaje inmediato con el mismo sessionId (simulando StrictMode remount)
      rerender(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-strict-mode-100"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      // Invocación B (segundo montaje) resuelve PRIMERO
      resolveB!({
        session_id: 'sess-strict-mode-100',
        module_id: 'domotica',
        bridge_port: 8766,
        active: true,
      });

      // Invocación A (primer montaje viejo) resuelve DESPUÉS
      resolveA!({
        session_id: 'sess-strict-mode-100',
        module_id: 'domotica',
        bridge_port: 8766,
        active: true,
      });

      // Verificar que el estado final en el frontend refleja la sesión activa sin quedarse en inactivo
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cva_gestures_session_start', {
          sessionId: 'sess-strict-mode-100',
          moduleId: 'domotica',
        });
        expect(screen.queryByText(/Se requiere una sesión SSH activa/i)).toBeNull();
      });
    });

    it('shows neutral "Conectando con el laboratorio..." when !sessionId and loading is true', () => {
      render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId={undefined}
            loading={true}
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      expect(screen.getByText('Conectando con el laboratorio...')).toBeDefined();
      expect(screen.getByText('Conexión con el Laboratorio')).toBeDefined();
      expect(screen.queryByText(/Se requiere una sesión SSH activa/i)).toBeNull();
    });

    it('shows real error and retry button when !sessionId and error is present, calling onRetry/connect on click', () => {
      const mockConnect = vi.fn();
      render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId={undefined}
            loading={false}
            error="Error SSH: Timeout al alcanzar la Raspberry Pi (20s)"
            connect={mockConnect}
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      expect(screen.getByText('Error SSH: Timeout al alcanzar la Raspberry Pi (20s)')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /Reintentar conexión/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('shows fallback message when !sessionId, !loading, and !error', () => {
      render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId={undefined}
            loading={false}
            error={null}
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      expect(screen.getByText('Se requiere una sesión SSH activa en el laboratorio para transmitir video analítica.')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Reintentar conexión/i })).toBeNull();
    });

    it('treats SESSION_ALREADY_ACTIVE error as active session without displaying error', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'cva_gestures_session_start') {
          return Promise.reject(new Error('SESSION_ALREADY_ACTIVE: session is already registered in backend'));
        }
        if (cmd === 'cva_gestures_session_stop') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-already-active-999"
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cva_gestures_session_start', {
          sessionId: 'sess-already-active-999',
          moduleId: 'domotica',
        });
      });

      // No debe mostrar ningún mensaje de error
      expect(screen.queryByText(/Error al iniciar la sesión CVA/i)).toBeNull();
      expect(screen.queryByText(/SESSION_ALREADY_ACTIVE/i)).toBeNull();
      expect(screen.queryByText(/Se requiere una sesión SSH activa/i)).toBeNull();
    });

    it('does not re-invoke cva_gestures_session_start when loading or error changes while session is active', async () => {
      (invoke as any).mockResolvedValue({
        session_id: 'sess-stable-123',
        module_id: 'domotica',
        bridge_port: 8766,
        active: true,
      });

      const { rerender } = render(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-stable-123"
            loading={true}
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(1);
      });

      // Re-render simulando cambio en autoConnect (loading pasa de true a false)
      rerender(
        <MantineProvider>
          <CVA_GesturePracticePage
            moduleId="domotica"
            sessionId="sess-stable-123"
            loading={false}
            error={null}
            camera={{ ...mockCamera, active: true }}
            onBack={vi.fn()}
          />
        </MantineProvider>
      );

      // invoke NO debe haberse llamado una segunda vez
      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });
});