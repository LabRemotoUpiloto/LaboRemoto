import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../src/store/app';
import { fetchQueryData } from '../../src/hooks/useQueryData';

/**
 * Tests de `fetchQueryData` (Batch 3 fixes): deduplicación de fetches
 * concurrentes con la misma key. Se testea contra la lógica exportada
 * directamente (sin renderizar el hook con React Testing Library), tal
 * como está pensada la función.
 */
describe('fetchQueryData', () => {
  beforeEach(() => {
    useAppStore.getState().invalidateAllQueries();
  });

  it('calls queryFn only once when two concurrent calls share the same key', async () => {
    let resolveFn: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveFn = resolve;
    });
    const queryFn = vi.fn(() => pending);

    const call1 = fetchQueryData('dedupe-key', queryFn);
    const call2 = fetchQueryData('dedupe-key', queryFn);

    // Both calls started before the first one resolved, so only one
    // invocation of queryFn should have happened.
    expect(queryFn).toHaveBeenCalledTimes(1);

    resolveFn!('resolved-value');
    await Promise.all([call1, call2]);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queryCache['dedupe-key']?.data).toBe('resolved-value');
  });

  it('allows a new fetch once the in-flight promise has settled', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await fetchQueryData('sequential-key', queryFn, { ttl: 30_000 });
    // Data is now fresh, so a second call without force should not refetch.
    await fetchQueryData('sequential-key', queryFn, { ttl: 30_000 });
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Forcing bypasses the freshness check and triggers a new call.
    await fetchQueryData('sequential-key', queryFn, { ttl: 30_000, force: true });
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().queryCache['sequential-key']?.data).toBe('second');
  });

  it('does not dedupe fetches for different keys', async () => {
    const queryFnA = vi.fn().mockResolvedValue('a');
    const queryFnB = vi.fn().mockResolvedValue('b');

    await Promise.all([fetchQueryData('key-a', queryFnA), fetchQueryData('key-b', queryFnB)]);

    expect(queryFnA).toHaveBeenCalledTimes(1);
    expect(queryFnB).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queryCache['key-a']?.data).toBe('a');
    expect(useAppStore.getState().queryCache['key-b']?.data).toBe('b');
  });

  it('propagates the error to the store for the caller that owns the in-flight promise, and dedupe callers resolve without throwing', async () => {
    let rejectFn: (err: Error) => void;
    const pending = new Promise<string>((_resolve, reject) => {
      rejectFn = reject;
    });
    const queryFn = vi.fn(() => pending);

    const call1 = fetchQueryData('error-key', queryFn);
    const call2 = fetchQueryData('error-key', queryFn);

    rejectFn!(new Error('boom'));

    await expect(Promise.all([call1, call2])).resolves.toBeDefined();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queryCache['error-key']?.error).toBeInstanceOf(Error);
  });
});
