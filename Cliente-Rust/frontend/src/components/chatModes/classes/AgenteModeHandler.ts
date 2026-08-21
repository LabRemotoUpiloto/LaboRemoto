import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message, AgentChatResponse, AgentStep } from '../types';
import { PI4_AGENT_SESSION_ID } from '../../../constants/devices';
import { pi4AgentReady } from '../../../services/ai.service';
import {
  shouldOpenPi4ChatTerminal,
  shouldOpenPi4ChatCameras,
  shouldOpenPi4ChatDesktop,
} from '../../../utils/pi4ChatIntents';

async function fakeStream(text: string, ctx: ModeHandlerContext): Promise<void> {
  const CHUNK = 20;
  const DELAY = 15;
  for (let i = 0; i < text.length; i += CHUNK) {
    ctx.setStreamedText(prev => prev + text.slice(i, i + CHUNK));
    await new Promise<void>(r => setTimeout(r, DELAY));
  }
}

export class AgenteModeHandler extends BaseModeHandler {
  help = 'Agente: ejecuta comandos en el servidor o en la Raspberry Pi (.env). Usa Claude con tools SSH reales.';

  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    let effectiveSessionId = ctx.sessionId ?? ctx.pi4TerminalSessionId ?? null;
    if (!effectiveSessionId) {
      const ready = await pi4AgentReady();
      if (!ready) {
        ctx.setMessages(prev => [...prev, {
          id: String(Date.now()),
          sender: 'system',
          text: '⚠️ Sin sesión SSH. Configura PI4_USER y PI4_PASSWORD en Cliente-Rust/.env o conéctate por terminal.',
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
      meta: { chat_mode: 'agente', toolSteps: [] } as any,
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
            meta: { ...m.meta, chat_mode: 'agente', toolSteps: [...prevSteps, step] } as any,
          };
        }));
      });

      const resp = await invoke<AgentChatResponse>('agent_chat', {
        req: {
          session_id: effectiveSessionId,
          message: finalInput,
          include_terminal_context: true,
          terminal_lines: 80,
          request_id: streamId,
          model_selection: ctx.selectedModel,
        },
      });
      unlistenStep?.();
      unlistenStep = null;

      await fakeStream(resp.answer, ctx);

      const wantsDesktop = shouldOpenPi4ChatDesktop(finalInput, resp.steps);
      const wantsCameras = shouldOpenPi4ChatCameras(finalInput, resp.steps);
      const wantsTerminal = shouldOpenPi4ChatTerminal(finalInput, resp.steps);

      const openDesktop = wantsDesktop && !!ctx.openPi4DesktopInChat;
      const openCameras = !ctx.sessionId && wantsCameras && !!ctx.openPi4CamerasInChat;
      const openTerminal =
        !ctx.sessionId &&
        !openDesktop &&
        wantsTerminal &&
        !!ctx.openPi4TerminalInChat;

      ctx.setStreamedText('');
      ctx.setStreamingMsgId(null);
      ctx.setMessages(prev => prev.map(m =>
        m.id === streamId
          ? {
              ...m,
              text: resp.answer,
              meta: {
                toolSteps: resp.steps,
                chat_mode: 'agente',
                embeddedPi4Terminal: openTerminal,
                embeddedPi4Cameras: openCameras,
                embeddedPi4Desktop: openDesktop,
              } as any,
            }
          : m
      ));

      if (openCameras) {
        await ctx.openPi4CamerasInChat?.();
      } else if (openDesktop) {
        await ctx.openPi4DesktopInChat?.();
      } else if (openTerminal) {
        await ctx.openPi4TerminalInChat?.();
      }
    } catch (e: any) {
      unlistenStep?.();
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

