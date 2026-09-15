// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { useLocalCamera } from '../../src/hooks/useLocalCamera';

describe('useLocalCamera', () => {
  let mockTrack: any;
  let mockStream: any;

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
      onended: null,
    };
    mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: 'cam-1', kind: 'videoinput', label: 'Webcam 1' },
          { deviceId: 'cam-2', kind: 'videoinput', label: 'Webcam 2' },
        ]),
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with default initial state and enumerates devices', async () => {
    const { result } = renderHook(() => useLocalCamera());

    expect(result.current.active).toBe(false);
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBeNull();

    // Permitir resoluciones asíncronas de enumerateDevices
    await act(async () => {});

    expect(result.current.devices.length).toBe(2);
    expect(result.current.selectedDeviceId).toBe('cam-1');
  });

  it('starts camera successfully and updates stream and active state', async () => {
    const { result } = renderHook(() => useLocalCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.active).toBe(true);
    expect(result.current.stream).toBe(mockStream);
    expect(result.current.error).toBeNull();
  });

  it('handles permission denied error (NotAllowedError)', async () => {
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useLocalCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.active).toBe(false);
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toContain('Permiso denegado');
  });

  it('handles camera in use error (NotReadableError)', async () => {
    const err = new Error('Hardware error');
    err.name = 'NotReadableError';
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useLocalCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.active).toBe(false);
    expect(result.current.error).toContain('siendo utilizada por otra aplicación');
  });

  it('stops camera and releases tracks cleanly', async () => {
    const { result } = renderHook(() => useLocalCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.active).toBe(true);

    act(() => {
      result.current.stopCamera();
    });

    expect(result.current.active).toBe(false);
    expect(result.current.stream).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
