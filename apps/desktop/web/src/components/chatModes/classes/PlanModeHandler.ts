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

export class PlanModeHandler extends BaseModeHandler {
  help = 'Plan: inspecciona el servidor y genera un plan estructurado en fases con comandos reales.';

  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    if (!ctx.sessionId) {
      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'system',
        text: '⚠️ El modo Plan requiere una sesión SSH activa para inspeccionar el servidor.',
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
      meta: { chat_mode: 'plan' } as any,
    }]);

    try {
      const resp = await invoke<AgentChatResponse>('plan_chat', {
        req: {
          session_id: ctx.sessionId,
          message: finalInput,
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
        { id: String(Date.now()), sender: 'system' as const, text: `Error generando el plan: ${String(e)}` },
      ]);
    } finally {
      ctx.setIsSending(false);
    }
  }
}

