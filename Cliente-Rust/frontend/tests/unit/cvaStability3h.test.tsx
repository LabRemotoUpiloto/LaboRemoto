// @vitest-environment jsdom
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import CVA_GesturePracticePage from '../../src/pages/cva-gestures/CVA_GesturePracticePage';
import { CVA_ConfigSidebar } from '../../src/components/cva-gestures/CVA_ConfigSidebar';
import {
  BoundedCircularBuffer,
  CvaDiagnosticSnapshot,
  exportDiagnosticsToCsv,
  LongTaskTracker,
} from '../../src/utils/cvaSessionDiagnostics';
import { useHandSkeleton } from '../../src/hooks/useHandSkeleton';
import { renderHook } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: vi.fn(),
  },
  HandLandmarker: {
    createFromOptions: vi.fn(),
  },
}));

describe('CVA Estabilidad 3 Horas — Suite de Tests de Regresión (Defectos A–F)', () => {
  const invokeMock = vi.mocked(invoke);
  let mockDetectForVideo: any;
  let mockClose: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      canvas: { width: 320, height: 240 },
    };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,dGVzdGZyYW1l');

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

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

    mockDetectForVideo = vi.fn().mockReturnValue({
      landmarks: [
        Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5, z: 0 })),
      ],
      handedness: [[{ score: 0.95 }]],
    });
    mockClose = vi.fn();

    (FilesetResolver.forVisionTasks as any).mockResolvedValue({});
    (HandLandmarker.createFromOptions as any).mockResolvedValue({
      detectForVideo: mockDetectForVideo,
      close: mockClose,
    });

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'cva_gestures_session_start') return Promise.resolve(undefined as any);
      if (cmd === 'cva_gestures_session_stop') return Promise.resolve(undefined as any);
      if (cmd === 'nvr_list_cameras') return Promise.resolve([] as any);
      if (cmd === 'cva_gestures_send_frame') {
        return Promise.resolve({
          fps_real: 7.0,
          bytes_sent: 24500,
          total_frames: 1,
        } as any);
      }
      return Promise.resolve(undefined as any);
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // 1. Defecto E: Guardia de cuadro en vuelo
  it('E: Si una transmisión está en vuelo (isSendingRef=true), los cuadros subsiguientes se descartan para no acumular encolamiento', async () => {
    // Simular un envío lento que no responde inmediatamente
    let resolveSendFrame: (val: any) => void = () => {};
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'cva_gestures_send_frame') {
        return new Promise((resolve) => {
          resolveSendFrame = resolve;
        });
      }
      if (cmd === 'cva_gestures_session_start') return Promise.resolve(undefined as any);
      return Promise.resolve(undefined as any);
    });

    const mockCamera = {
      stream: {} as MediaStream,
      active: true,
      error: null,
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
    };

    render(
      <MantineProvider>
        <CVA_GesturePracticePage
          moduleId="domotica"
          camera={mockCamera}
          sessionId="test-session-flight"
          onBack={vi.fn()}
        />
      </MantineProvider>
    );

    // Permitir inicio de sesión CVA y activación del bucle de transmisión
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const videoEl = screen.getByTestId('local-video') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 480, configurable: true });
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });
    Object.defineProperty(videoEl, 'ended', { value: false, configurable: true });

    // Disparar 1er intervalo: inicia envío en vuelo
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    const sendCallsFirst = invokeMock.mock.calls.filter(([cmd]) => cmd === 'cva_gestures_send_frame').length;
    expect(sendCallsFirst).toBe(1);

    // Disparar 2do intervalo mientras el 1ero sigue pendiente (en vuelo): debe descartarse
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    const sendCallsSecond = invokeMock.mock.calls.filter(([cmd]) => cmd === 'cva_gestures_send_frame').length;
    expect(sendCallsSecond).toBe(1); // No aumentó a 2: se descartó el frame en vuelo

    // Resolver el 1er envío
    await act(async () => {
      resolveSendFrame({
        fps_real: 7.0,
        bytes_sent: 24500,
        total_frames: 1,
      });
      await Promise.resolve();
    });

    // Ahora que concluyó, el siguiente intervalo sí debe enviar
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    const sendCallsThird = invokeMock.mock.calls.filter(([cmd]) => cmd === 'cva_gestures_send_frame').length;
    expect(sendCallsThird).toBe(2);
  });

  // 2. Defecto C: Protección contra reasignación redundante de canvas.width y canvas.height
  it('C: No reasigna dimensiones de canvas si no han cambiado, evitando reset de contexto y GC continuo', async () => {
    const mockCamera = {
      stream: {} as MediaStream,
      active: true,
      error: null,
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
    };

    render(
      <MantineProvider>
        <CVA_GesturePracticePage
          moduleId="domotica"
          camera={mockCamera}
          sessionId="test-session-canvas"
          onBack={vi.fn()}
        />
      </MantineProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const skeletonCanvas = screen.getByTestId('skeleton-canvas') as HTMLCanvasElement;
    skeletonCanvas.width = 640;
    skeletonCanvas.height = 480;

    let widthSetCount = 0;
    let heightSetCount = 0;
    let currentW = 640;
    let currentH = 480;

    Object.defineProperty(skeletonCanvas, 'width', {
      get: () => currentW,
      set: (val) => {
        widthSetCount++;
        currentW = val;
      },
      configurable: true,
    });
    Object.defineProperty(skeletonCanvas, 'height', {
      get: () => currentH,
      set: (val) => {
        heightSetCount++;
        currentH = val;
      },
      configurable: true,
    });

    const videoEl = screen.getByTestId('local-video') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 480, configurable: true });
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });
    Object.defineProperty(videoEl, 'ended', { value: false, configurable: true });

    // Disparar animación RAF: el canvas ya mide 640x480, por lo que no debe reasignar
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(widthSetCount).toBe(0);
    expect(heightSetCount).toBe(0);
  });

  // 3. Defecto B & A: Adaptación de tasa del esqueleto y límite de FPS
  it('A & B: Adapta el ritmo de FPS del esqueleto con histéresis ante costo de detección variable', async () => {
    const { result } = renderHook(() => useHandSkeleton(true, 15));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.currentFps).toBe(15);
    expect(result.current.status).toBe('activo');

    const ctx = {
      canvas: { width: 640, height: 480 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineJoin: '',
      lineCap: '',
    } as unknown as CanvasRenderingContext2D;

    // Simular detección con costo alto (35ms > umbral 28ms para bajar a 10 FPS)
    const perfNowSpy = vi.spyOn(performance, 'now');
    let clock = 1000;
    perfNowSpy.mockImplementation(() => clock);

    // Ejecutar varias muestras a costo alto
    for (let i = 1; i <= 5; i++) {
      clock += 70; // Avanzar tiempo suficiente para superar minIntervalMs
      perfNowSpy.mockReturnValueOnce(clock); // now al entrar
      perfNowSpy.mockReturnValueOnce(clock); // detectStart
      perfNowSpy.mockReturnValueOnce(clock + 35); // detectEnd (+35ms de costo)

      const video = {
        paused: false,
        ended: false,
        readyState: 4,
        currentTime: i * 0.1,
      } as unknown as HTMLVideoElement;

      act(() => {
        result.current.processAndDrawFrame(ctx, video, 20);
      });
    }

    // Comprobar que redujo la tasa de detección
    expect(result.current.currentFps).toBeLessThanOrEqual(10);
    perfNowSpy.mockRestore();
  });

  // 4. Defecto D: Recuperación ante errores en tiempo de ejecución con backoff
  it('D: Ante errores consecutivos en tiempo de ejecución pasa a estado recuperando y reintenta recrear el modelo', async () => {
    const { result } = renderHook(() => useHandSkeleton(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('activo');

    // Forzar fallo de runtime en detectForVideo
    mockDetectForVideo.mockImplementation(() => {
      throw new Error('WebGL context lost');
    });

    const ctx = {
      canvas: { width: 640, height: 480 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    // 3 fallos consecutivos
    for (let i = 1; i <= 3; i++) {
      const video = {
        paused: false,
        ended: false,
        readyState: 4,
        currentTime: i * 0.05,
      } as unknown as HTMLVideoElement;

      act(() => {
        result.current.processAndDrawFrame(ctx, video, 20);
      });
    }

    // Debe cambiar a 'recuperando'
    expect(result.current.status).toBe('recuperando');

    // La recreación falla reiteradamente hasta agotar reintentos (MAX_RECOVERY_ATTEMPTS = 3)
    (HandLandmarker.createFromOptions as any).mockRejectedValue(new Error('Fatal recreation error'));

    // 1er intento (1000ms)
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    // 2do intento (2000ms)
    await act(async () => {
      vi.advanceTimersByTime(2100);
      await Promise.resolve();
    });

    // 3er intento (4000ms)
    await act(async () => {
      vi.advanceTimersByTime(4100);
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.isDisabled).toBe(true);
  });

  // 5. Defecto F: Búfer circular acotado y diagnósticos de sesión 3h
  it('F: BoundedCircularBuffer se mantiene acotado al tamaño máximo (1.200 muestras) en simulación continua', () => {
    const buffer = new BoundedCircularBuffer<CvaDiagnosticSnapshot>(1200);

    // Empujar 1500 muestras simulando más de 4 horas
    for (let i = 0; i < 1500; i++) {
      buffer.push({
        timestamp: new Date().toISOString(),
        envioCargaPct: 15,
        esqueletoCostoMs: 12.5,
        esqueletoFps: 15,
        esqueletoEstado: 'activo',
        cuadrosEnviados: i,
        cuadrosDescartados: 0,
        cuadrosFallidos: 0,
        memoriaJsMb: 42.1,
        tareasLargasCount: 0,
      });
    }

    expect(buffer.size()).toBe(1200);
    const all = buffer.getAll();
    expect(all.length).toBe(1200);
    expect(all[0].cuadrosEnviados).toBe(300); // Los primeros 300 se descartaron
    expect(all[1199].cuadrosEnviados).toBe(1499);
  });

  // 6. Defecto F & UI: Badge dinámico de estado en CVA_ConfigSidebar y botón de exportación CSV
  it('F: CVA_ConfigSidebar renderiza los badges de estado del esqueleto y permite exportar CSV', () => {
    const onExportMock = vi.fn();

    const { rerender } = render(
      <MantineProvider>
        <CVA_ConfigSidebar
          opened={true}
          onClose={vi.fn()}
          showMetrics={true}
          onToggleShowMetrics={vi.fn()}
          skeletonColor="#10B981"
          onChangeSkeletonColor={vi.fn()}
          sensitivity="balanceado"
          onChangeSensitivity={vi.fn()}
          skeletonStatus="activo"
          diagnosticsCount={45}
          onExportDiagnostics={onExportMock}
        />
      </MantineProvider>
    );

    expect(screen.getAllByText('Activo').length).toBe(2);
    expect(screen.getByText('45 muestras')).toBeDefined();

    const exportBtn = screen.getByRole('button', { name: /Exportar registro \(CSV\)/i });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      exportBtn.click();
    });
    expect(onExportMock).toHaveBeenCalledTimes(1);

    // Cambiar a pausado por carga
    rerender(
      <MantineProvider>
        <CVA_ConfigSidebar
          opened={true}
          onClose={vi.fn()}
          showMetrics={true}
          onToggleShowMetrics={vi.fn()}
          skeletonColor="#10B981"
          onChangeSkeletonColor={vi.fn()}
          sensitivity="balanceado"
          onChangeSensitivity={vi.fn()}
          skeletonStatus="pausado por carga"
          diagnosticsCount={50}
          onExportDiagnostics={onExportMock}
        />
      </MantineProvider>
    );

    expect(screen.getByText('Pausado por carga')).toBeDefined();
  });
});
