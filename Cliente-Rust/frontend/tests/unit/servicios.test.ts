// @vitest-environment jsdom
// Los servicios mandan a Rust exactamente lo que espera cada #[tauri::command] (backend/src/cmd/**).
// Varios estaban mal y nadie lo notó porque no se usaban: estas pruebas fijan la forma de cada envío.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn() }));

import { agentChat, aiChat, cancelAiChat, getTerminalContext, planChat } from '@/features/chat/ai.service';
import {
  SAVE_SESSION_BEFORE_CLOSE_EVENT, emitSaveSessionBeforeClose, memClear, memGet, memPut, vncStart, vncStop,
} from '../../src/services/ssh.service';
import { chatHistoryDeleteEntry, chatHistoryLoad, chatHistorySave, localListDir } from '@/lib/storage.service';

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

const ultimo = () => invokeMock.mock.calls.at(-1) as [string, Record<string, unknown>];

describe('ai.service', () => {
  it('ai_chat recibe el pedido envuelto en `req` y devuelve el sobre completo', async () => {
    const sobre = { status: 'success', data: { text: 'hola' } };
    invokeMock.mockResolvedValue(sobre);
    const req = { id: 'r1', version: '1.0', payload: { message: 'hola' }, timestamp_ms: 1 } as never;
    await expect(aiChat(req)).resolves.toBe(sobre);
    expect(ultimo()).toEqual(['ai_chat', { req }]);
  });

  it('cancel_ai_chat recibe un CommandRequest con payload.request_id (ai.rs: req: CommandRequest<CancelAiChatPayload>)', async () => {
    await cancelAiChat('pedido-7');
    const [cmd, args] = ultimo();
    expect(cmd).toBe('cancel_ai_chat');
    expect(args.req).toMatchObject({ version: '1.0', payload: { request_id: 'pedido-7' } });
    expect(typeof (args.req as { id: unknown }).id).toBe('string');
    expect(typeof (args.req as { timestamp_ms: unknown }).timestamp_ms).toBe('number');
  });

  it('agent_chat y plan_chat reciben `req` sin sobre (tools.rs: req: AgentChatRequest / PlanChatRequest)', async () => {
    const pedido = { session_id: 's1', message: 'ls' };
    await agentChat(pedido);
    expect(ultimo()).toEqual(['agent_chat', { req: pedido }]);
    await planChat(pedido);
    expect(ultimo()).toEqual(['plan_chat', { req: pedido }]);
  });

  it('get_terminal_context recibe sessionId y lines (tools.rs: session_id, lines: Option<usize>)', async () => {
    await getTerminalContext('s1', 80);
    expect(ultimo()).toEqual(['get_terminal_context', { sessionId: 's1', lines: 80 }]);
  });
});

describe('ssh.service', () => {
  it('vnc_start recibe sessionId y resolution (vnc/mod.rs)', async () => {
    await vncStart('s1', '1280x720');
    expect(ultimo()).toEqual(['vnc_start', { sessionId: 's1', resolution: '1280x720' }]);
    await vncStop('s1');
    expect(ultimo()).toEqual(['vnc_stop', { sessionId: 's1' }]);
  });

  it('la memoria de sesión manda sessionId (y el parche al guardar)', async () => {
    await memGet('s1');
    expect(ultimo()).toEqual(['mem_get', { sessionId: 's1' }]);
    await memPut('s1', { practiceTutorial: 'x' } as never);
    expect(ultimo()).toEqual(['mem_put', { sessionId: 's1', patch: { practiceTutorial: 'x' } }]);
    await memClear('s1');
    expect(ultimo()).toEqual(['mem_clear', { sessionId: 's1' }]);
  });

  it('el guardado antes de cerrar es un CustomEvent de window (así lo escucha la captura de sesión)', () => {
    const oyente = vi.fn();
    window.addEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, oyente);
    emitSaveSessionBeforeClose('s1');
    window.removeEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, oyente);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect((oyente.mock.calls[0][0] as CustomEvent).detail).toEqual({ sessionId: 's1' });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('storage.service', () => {
  it('el historial del chat va por sessionId + mode (filesystem/local.rs), no por una clave', async () => {
    await chatHistoryLoad('s1', 'agente');
    expect(ultimo()).toEqual(['chat_history_load', { sessionId: 's1', mode: 'agente' }]);
    await chatHistorySave('s1', 'agente', [{ id: 'e1' }]);
    expect(ultimo()).toEqual(['chat_history_save', { sessionId: 's1', mode: 'agente', entries: [{ id: 'e1' }] }]);
    await chatHistoryDeleteEntry('s1', 'agente', 'e1');
    expect(ultimo()).toEqual(['chat_history_delete_entry', { sessionId: 's1', mode: 'agente', entryId: 'e1' }]);
  });

  it('local_list_dir recibe path', async () => {
    await localListDir('C:\\Users');
    expect(ultimo()).toEqual(['local_list_dir', { path: 'C:\\Users' }]);
  });
});
