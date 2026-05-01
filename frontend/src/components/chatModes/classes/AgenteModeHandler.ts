import { invoke } from '@tauri-apps/api/core';
import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message, AgentChatResponse } from '../types';

async function fakeStream(text: string, ctx: ModeHandlerContext): Promise<void> {
  const CHUNK = 20;
  const DELAY = 15;
  for (let i = 0; i < text.length; i += CHUNK) {
    ctx.setStreamedText(prev => prev + text.slice(i, i + CHUNK));
    await new Promise<void>(r => setTimeout(r, DELAY));
  }
}

export class AgenteModeHandler extends BaseModeHandler {
  help = 'Agente: ejecuta comandos, lee/escribe archivos, diagnóstica el servidor. Usa Claude con tools reales.';

  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    if (!ctx.sessionId) {
      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'system',
        text: '⚠️ El modo Agente requiere una sesión SSH activa.',
      }]);
      return;
    }

    ctx.setIsSending(true);
    const streamId = String(Date.now() + 1);
    ctx.setStreamingMsgId(streamId);
    ctx.setStreamedText('');
    ctx.setMessages(prev => [...prev, {
      id: streamId,
      sender: 'ai' as const,
      text: '',
      timestamp: Date.now(),
      meta: { chat_mode: 'agente' } as any,
    }]);

    try {
      const resp = await invoke<AgentChatResponse>('agent_chat', {
        req: {
          session_id: ctx.sessionId,
          message: finalInput,
          include_terminal_context: true,
          terminal_lines: 80,
        },
      });

      await fakeStream(resp.answer, ctx);

      ctx.setStreamedText('');
      ctx.setStreamingMsgId(null);
      ctx.setMessages(prev => prev.map(m =>
        m.id === streamId
          ? { ...m, text: resp.answer, meta: { toolSteps: resp.steps } as any }
          : m
      ));
    } catch (e: any) {
      ctx.setStreamedText('');
      ctx.setStreamingMsgId(null);
      ctx.setMessages(prev => [
        ...prev.filter(m => m.id !== streamId),
        { id: String(Date.now()), sender: 'system' as const, text: `Error del agente: ${String(e)}` },
      ]);
    } finally {
      ctx.setIsSending(false);
    }
  }
}

