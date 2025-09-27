import { ModeHandler, ModeHandlerContext, Message, ChatMode } from './types';

export const askModeHandler: ModeHandler = {
  canSend() { return true; },
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeAsk({ finalInput, mode: 'ask', userMsg });
  },
  help: 'Consulta: Genera codigo ,explica, resume o responde preguntas generales del contexto.'
};
