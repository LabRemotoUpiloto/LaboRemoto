import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message, AgentChatResponse, AgentStep } from '../types';
import { PI4_AGENT_SESSION_ID } from '../../../constants/devices';
import { pi4AgentReady } from '../../../services/ai.service';

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
    let effectiveSessionId = ctx.sessionId ?? null;
    if (!effectiveSessionId) {
      const ready = await pi4AgentReady();
      if (!ready) {
        ctx.setMessages(prev => [...prev, {
          id: String(Date.now()),
          sender: 'system',
          text: '⚠️ Sin sesión SSH. Configura PI4_USER y PI4_PASSWORD en .env o conéctate por terminal.',
        }]);
        return;
      }
      effectiveSessionId = PI4_AGENT_SESSION_ID;
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
      meta: { chat_mode: 'plan', toolSteps: [] } as any,
    }]);

    let unlistenStep: (() => void) | null = null;
    try {
      unlistenStep = await listen<{ request_id: string; step: AgentStep }>('agent:step', ev => {
        if (ev.payload.request_id !== streamId) return;
        const step = ev.payload.step;
        ctx.setMessages(prev => prev.map(m => {
          if (m.id !== streamId) return m;
          const prevSteps = (m.meta?.toolSteps ?? []) as AgentStep[];
          return {
            ...m,
            meta: { ...m.meta, chat_mode: 'plan', toolSteps: [...prevSteps, step] } as any,
          };
        }));
      });

      const resp = await invoke<AgentChatResponse>('plan_chat', {
        req: {
          session_id: effectiveSessionId,
          message: finalInput,
          request_id: streamId,
        },
      });
      unlistenStep?.();
      unlistenStep = null;

      await fakeStream(resp.answer, ctx);

      ctx.setStreamedText('');
      ctx.setStreamingMsgId(null);
      ctx.setMessages(prev => prev.map(m =>
        m.id === streamId
          ? { ...m, text: resp.answer, meta: { toolSteps: resp.steps } as any }
          : m
      ));
    } catch (e: any) {
      unlistenStep?.();
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

