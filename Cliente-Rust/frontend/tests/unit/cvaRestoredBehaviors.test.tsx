// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MantineProvider } from '@mantine/core';

// Mock de @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock de @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Mock de useHandSkeleton para capturar exactamente los argumentos recibidos por processAndDrawFrame
const mockProcessAndDrawFrame = vi.fn();
vi.mock('../../src/hooks/useHandSkeleton', () => ({
  useHandSkeleton: () => ({
    processAndDrawFrame: mockProcessAndDrawFrame,
    skeletonColor: '#00ffcc',
    setSkeletonColor: vi.fn(),
  }),
}));

import { invoke } from '@tauri-apps/api/core';
import CVA_GesturePracticePage from '../../src/pages/cva-gestures/CVA_GesturePracticePage';

describe('CVA Restored Behaviors Regression Suite', () => {
  const mockCamera = {
    stream: { id: 'local-mock-stream' } as any,
    active: true,
    error: null,
    devices: [],
    selectedDeviceId: null,
    setSelectedDeviceId: vi.fn(),
    startCamera: vi.fn().mockResolvedValue(null),
    stopCamera: vi.fn(),
  };

  const mockCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    canvas: { width: 320, height: 240 },
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

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,dGVzdGZyYW1l');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PRUEBA A: Valor real de cpuLoad pasado a processAndDrawFrame
  // ──────────────────────────────────────────────────────────────────────────
  it('a) pasa el valor real de cpuLoad (> 0) a processAndDrawFrame en lugar del hardcodeado 0', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cva_gestures_session_start') {
        return Promise.resolve({
          session_id: 'sess-cpu-test',
          module_id: 'domotica',
          bridge_port: 8766,
          active: true,
        });
      }
      if (cmd === 'cva_gestures_send_frame') {
        return Promise.resolve({
          fps_real: 7.2,
          bytes_sent: 1024,
          total_frames: 10,
        });
      }
      return Promise.resolve();
    });

    let perfCounter = 1000;
    const originalPerfNow = performance.now;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      perfCounter += 30;
      return perfCounter;
    });

    render(
      <MantineProvider>
        <CVA_GesturePracticePage
          moduleId="domotica"
          sessionId="sess-cpu-test"
          camera={mockCamera}
          onBack={vi.fn()}
        />
      </MantineProvider>
    );

    const video = screen.getByTestId('local-video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cva_gestures_send_frame', expect.anything());
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockProcessAndDrawFrame).toHaveBeenCalled();
      const callsWithCalculatedCpu = mockProcessAndDrawFrame.mock.calls.filter((call) => {
        const receivedCpuLoad = call[2];
        return typeof receivedCpuLoad === 'number' && receivedCpuLoad > 0;
      });
      expect(callsWithCalculatedCpu.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    performance.now = originalPerfNow;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PRUEBA B: Con sessionError definido el bucle NO envía frames
  // ──────────────────────────────────────────────────────────────────────────
  it('b) con sessionError definido el bucle detiene inmediatamente el envío de frames a la Pi', async () => {
    let sendFrameCalls = 0;

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cva_gestures_session_start') {
        return Promise.resolve({
          session_id: 'sess-err-test',
          module_id: 'domotica',
          bridge_port: 8766,
          active: true,
        });
      }
      if (cmd === 'cva_gestures_send_frame') {
        sendFrameCalls++;
        return Promise.reject(new Error('PIPE_BROKEN: conexión con Raspberry Pi interrumpida'));
      }
      return Promise.resolve();
    });

    render(
      <MantineProvider>
        <CVA_GesturePracticePage
          moduleId="domotica"
          sessionId="sess-err-test"
          camera={mockCamera}
          onBack={vi.fn()}
        />
      </MantineProvider>
    );

    const video = screen.getByTestId('local-video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    await waitFor(() => {
      expect(screen.getByText(/Falla en envío de frame: PIPE_BROKEN/i)).toBeDefined();
    }, { timeout: 3000 });

    const callsAfterError = sendFrameCalls;
    expect(callsAfterError).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(sendFrameCalls).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PRUEBA C: Tras parada de emergencia el video local se pausa y al reanudar se reproduce
  // ──────────────────────────────────────────────────────────────────────────
  it('c) tras la parada de emergencia el <video> local se pausa y al reanudar se reproduce', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cva_gestures_session_start') {
        return Promise.resolve({
          session_id: 'sess-video-pause-test',
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

    render(
      <MantineProvider>
        <CVA_GesturePracticePage
          moduleId="domotica"
          sessionId="sess-video-pause-test"
          camera={mockCamera}
          onBack={vi.fn()}
        />
      </MantineProvider>
    );

    const video = screen.getByTestId('local-video') as HTMLVideoElement;

    expect(video.play).toHaveBeenCalled();
    const playCallsInitial = (video.play as any).mock.calls.length;

    const abortBtn = screen.getByRole('button', { name: /ABORTAR Y DETENER EQUIPOS/i });
    fireEvent.click(abortBtn);

    await waitFor(() => {
      expect(screen.getByText('Parada de Emergencia Activa')).toBeDefined();
      expect(video.pause).toHaveBeenCalled();
    });

    const resumeBtn = screen.getByRole('button', { name: /Reanudar Transmisión/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Parada de Emergencia Activa')).toBeNull();
      expect((video.play as any).mock.calls.length).toBeGreaterThan(playCallsInitial);
    });
  });
});
