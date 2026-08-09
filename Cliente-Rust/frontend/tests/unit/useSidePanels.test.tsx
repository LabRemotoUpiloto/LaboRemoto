// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSidePanels } from '../../src/hooks/useSidePanels';

describe('useSidePanels', () => {
  it('preserves an open camera panel for each session independently', () => {
    const { result } = renderHook(() => useSidePanels());

    act(() => result.current.setCameraPanelOpen('session-a', true));

    expect(result.current.isCameraOpen('session-a')).toBe(true);
    expect(result.current.isCameraOpen('session-b')).toBe(false);

    act(() => result.current.setCameraPanelOpen('session-b', true));
    act(() => result.current.closeCameraPanel('session-b'));

    expect(result.current.isCameraOpen('session-a')).toBe(true);
    expect(result.current.isCameraOpen('session-b')).toBe(false);
  });
});
