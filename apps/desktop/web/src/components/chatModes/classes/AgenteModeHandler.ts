import { invoke } from '@tauri-apps/api/core';
import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message, AgentChatResponse } from '../types';

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
    try {
      const resp = await invoke<AgentChatResponse>('agent_chat', {
        req: {
          session_id: ctx.sessionId,
          message: finalInput,
          include_terminal_context: true,
          terminal_lines: 80,
        },
      });

      // Mensaje con pasos de tools + respuesta final
      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'ai',
        text: resp.answer,
        meta: {
          toolSteps: resp.steps,
        } as any,
      }]);
    } catch (e: any) {
      ctx.setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'system',
        text: `Error del agente: ${String(e)}`,
      }]);
    } finally {
      ctx.setIsSending(false);
    }
  }
}
