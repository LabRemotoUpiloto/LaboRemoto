import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { QueryCacheSlice, createQueryCacheSlice } from '../../src/store/queryCache';

describe('queryCache slice', () => {
  let useStore: ReturnType<typeof create<QueryCacheSlice>>;

  beforeEach(() => {
    useStore = create<QueryCacheSlice>()((...a) => ({
      ...createQueryCacheSlice(...a),
    }));
  });

  it('starts with an empty cache', () => {
    expect(useStore.getState().queryCache).toEqual({});
  });

  it('setQueryLoading marks a key as loading without clobbering existing data', () => {
    useStore.getState().setQueryData('k1', { foo: 'bar' });
    useStore.getState().setQueryLoading('k1', true);

    const entry = useStore.getState().queryCache['k1'];
    expect(entry.isLoading).toBe(true);
    expect(entry.data).toEqual({ foo: 'bar' });
  });

  it('setQueryData stores data, resets loading/error and stamps timestamp', () => {
    const before = Date.now();
    useStore.getState().setQueryData('k1', [1, 2, 3]);
    const entry = useStore.getState().queryCache['k1'];

    expect(entry.data).toEqual([1, 2, 3]);
    expect(entry.isLoading).toBe(false);
    expect(entry.error).toBeNull();
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('setQueryError stores the error and clears loading while keeping previous data', () => {
    useStore.getState().setQueryData('k1', 'cached-value');
    const err = new Error('boom');
    useStore.getState().setQueryError('k1', err);

    const entry = useStore.getState().queryCache['k1'];
    expect(entry.error).toBe(err);
    expect(entry.isLoading).toBe(false);
    expect(entry.data).toBe('cached-value');
  });

  it('invalidateQuery removes only the targeted key', () => {
    useStore.getState().setQueryData('k1', 'a');
    useStore.getState().setQueryData('k2', 'b');

    useStore.getState().invalidateQuery('k1');

    expect(useStore.getState().queryCache['k1']).toBeUndefined();
    expect(useStore.getState().queryCache['k2']).toBeDefined();
  });

  it('invalidateAllQueries clears the entire cache', () => {
    useStore.getState().setQueryData('k1', 'a');
    useStore.getState().setQueryData('k2', 'b');

    useStore.getState().invalidateAllQueries();

    expect(useStore.getState().queryCache).toEqual({});
  });
});
