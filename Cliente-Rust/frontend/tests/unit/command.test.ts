import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Import after mocking so CommandClient picks up the mocked `invoke`.
import { CommandClient, CommandError } from '../../src/services/command.service';

interface SshConnectPayload {
  host: string;
  port: number;
  user: string;
  password: string;
  cols: number;
  rows: number;
}

interface SshConnectResponse {
  session_id: string;
}

describe('CommandClient', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('should invoke command with CommandRequest wrapper and unwrap the response data', async () => {
    invokeMock.mockResolvedValue({
      status: 'success',
      data: { session_id: 'test-123' },
      id: 'req-1',
      version: '1.0',
      elapsed_ms: 100,
    });

    const client = new CommandClient();
    const response = await client.invoke<SshConnectPayload, SshConnectResponse>('ssh_connect', {
      host: 'localhost',
      port: 22,
      user: 'test',
      password: 'test',
      cols: 80,
      rows: 30,
    });

    expect(response.session_id).toBe('test-123');
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const [command, args] = invokeMock.mock.calls[0];
    expect(command).toBe('ssh_connect');
    expect(args.request).toMatchObject({
      version: '1.0',
      payload: { host: 'localhost', port: 22 },
    });
    expect(typeof args.request.id).toBe('string');
    expect(args.request.id.length).toBeGreaterThan(0);
    expect(typeof args.request.timestamp_ms).toBe('number');
  });

  it('should retry on transient (retryable) error and eventually succeed', async () => {
    invokeMock
      .mockResolvedValueOnce({
        status: 'error',
        id: 'req-1',
        version: '1.0',
        elapsed_ms: 10,
        error: { code: 'TRANSIENT', message: 'timeout', retryable: true, retry_after_ms: 1 },
      })
      .mockResolvedValueOnce({
        status: 'success',
        id: 'req-2',
        version: '1.0',
        elapsed_ms: 20,
        data: { session_id: 'ok-after-retry' },
      });

    const client = new CommandClient();
    const response = await client.invoke<SshConnectPayload, SshConnectResponse>(
      'ssh_connect',
      { host: 'localhost', port: 22, user: 'a', password: 'b', cols: 80, rows: 24 },
      { retries: 3 },
    );

    expect(response.session_id).toBe('ok-after-retry');
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('should not retry on permanent error and should throw CommandError', async () => {
    invokeMock.mockResolvedValue({
      status: 'error',
      id: 'req-1',
      version: '1.0',
      elapsed_ms: 5,
      error: { code: 'PERMANENT', message: 'invalid credentials', retryable: false },
    });

    const client = new CommandClient();

    await expect(
      client.invoke<SshConnectPayload, SshConnectResponse>(
        'ssh_connect',
        { host: 'localhost', port: 22, user: 'a', password: 'wrong', cols: 80, rows: 24 },
        { retries: 3 },
      ),
    ).rejects.toBeInstanceOf(CommandError);

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('should give up after exhausting retries on a persistently transient error', async () => {
    invokeMock.mockResolvedValue({
      status: 'error',
      id: 'req-1',
      version: '1.0',
      elapsed_ms: 5,
      error: { code: 'TRANSIENT', message: 'still failing', retryable: true, retry_after_ms: 1 },
    });

    const client = new CommandClient();

    await expect(
      client.invoke<SshConnectPayload, SshConnectResponse>(
        'ssh_connect',
        { host: 'localhost', port: 22, user: 'a', password: 'b', cols: 80, rows: 24 },
        { retries: 2 },
      ),
    ).rejects.toBeInstanceOf(CommandError);

    // Intento inicial + 2 reintentos = 3 llamadas.
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });
});
