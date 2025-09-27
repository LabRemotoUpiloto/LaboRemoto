import { ModeHandler, ModeHandlerContext, Message } from './types';

export const analisisModeHandler: ModeHandler = {
  canSend() { return true; },
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeAsk({ finalInput, mode: 'analisis', userMsg });
  },
  help: 'Análisis: (beta) orientado a inspección y futura edición asistida de archivos.'
};
