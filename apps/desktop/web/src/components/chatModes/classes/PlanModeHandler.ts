import { invoke } from '@tauri-apps/api/core';
import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message, AgentChatResponse } from '../types';

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
    try {
      const resp = await invoke<AgentChatResponse>('plan_chat', {
        req: {
          session_id: ctx.sessionId,
          message: finalInput,
        },
      });

      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'ai',
        text: resp.answer,
        meta: { toolSteps: resp.steps } as any,
      }]);
    } catch (e: any) {
      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'system',
        text: `Error generando el plan: ${String(e)}`,
      }]);
    } finally {
      ctx.setIsSending(false);
    }
  }
}
