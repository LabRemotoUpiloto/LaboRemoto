// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHandSkeleton } from '../../src/hooks/useHandSkeleton';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: vi.fn(),
  },
  HandLandmarker: {
    createFromOptions: vi.fn(),
  },
}));

describe('useHandSkeleton Hook', () => {
  let mockDetectForVideo: any;
  let mockClose: any;
  let mockVision: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockDetectForVideo = vi.fn().mockReturnValue({
      landmarks: [
        Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5, z: 0 })),
      ],
      handedness: [[{ score: 0.95 }]],
    });

    mockClose = vi.fn();
    mockVision = {};

    (FilesetResolver.forVisionTasks as any).mockResolvedValue(mockVision);
    (HandLandmarker.createFromOptions as any).mockResolvedValue({
      detectForVideo: mockDetectForVideo,
      close: mockClose,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockVideo = (currentTime = 1) => ({
    paused: false,
    ended: false,
    readyState: 4,
    currentTime,
  }) as unknown as HTMLVideoElement;

  const createMockCtx = () => ({
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
  }) as unknown as CanvasRenderingContext2D;

  it('autopauses when cpuLoad > 70 and does not call detectForVideo or draw', async () => {
    const { result } = renderHook(() => useHandSkeleton(true));
    await act(async () => {
      await Promise.resolve();
    });

    const ctx = createMockCtx();
    const video = createMockVideo(1.0);

    act(() => {
      result.current.processAndDrawFrame(ctx, video, 75); // cpuLoad = 75
    });

    expect(mockDetectForVideo).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('degrades silently (isDisabled = true) when MediaPipe fails GPU and CPU loading', async () => {
    (HandLandmarker.createFromOptions as any).mockRejectedValue(new Error('WASM load error'));

    const { result } = renderHook(() => useHandSkeleton(true));

    await act(async () => {
      await Promise.resolve();
    });

    // Advance fake timer by 2500ms for retry
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(result.current.isDisabled).toBe(true);
  });

  it('falls back from GPU to CPU delegate if GPU creation rejects', async () => {
    let callCount = 0;
    (HandLandmarker.createFromOptions as any).mockImplementation((_vision: any, options: any) => {
      callCount++;
      if (options.baseOptions.delegate === 'GPU') {
        return Promise.reject(new Error('WebGL not supported'));
      }
      return Promise.resolve({
        detectForVideo: mockDetectForVideo,
        close: mockClose,
      });
    });

    const { result } = renderHook(() => useHandSkeleton(true));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(2);
    expect(result.current.isDisabled).toBe(false);
  });

  it('does not repeat work if video.currentTime has not changed', async () => {
    const { result } = renderHook(() => useHandSkeleton(true));
    await act(async () => {
      await Promise.resolve();
    });

    const ctx = createMockCtx();
    const video = createMockVideo(1.5);

    act(() => {
      result.current.processAndDrawFrame(ctx, video, 10);
    });
    expect(mockDetectForVideo).toHaveBeenCalledTimes(1);

    // Call again with same video.currentTime
    act(() => {
      result.current.processAndDrawFrame(ctx, video, 10);
    });
    expect(mockDetectForVideo).toHaveBeenCalledTimes(1); // Same frame, no extra detectForVideo
  });

  it('calls landmarker.close() on unmount', async () => {
    const { unmount } = renderHook(() => useHandSkeleton(true));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('handles a long simulated session (50+ consecutive frames) without accumulating errors or NaN', async () => {
    const { result } = renderHook(() => useHandSkeleton(true));
    await act(async () => {
      await Promise.resolve();
    });

    const ctx = createMockCtx();

    for (let frame = 1; frame <= 50; frame++) {
      const video = createMockVideo(frame * 0.033);
      act(() => {
        result.current.processAndDrawFrame(ctx, video, 20);
      });
    }

    expect(mockDetectForVideo).toHaveBeenCalledTimes(50);
    expect(ctx.save).toHaveBeenCalledTimes(50);
    expect(result.current.isDisabled).toBe(false);
  });
});
