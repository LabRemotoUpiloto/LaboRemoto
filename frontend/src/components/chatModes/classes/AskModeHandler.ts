import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';

export class AskModeHandler extends BaseModeHandler {
  help = 'Consulta: Genera codigo ,explica, resume o responde preguntas generales del contexto.';
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeAsk({ finalInput, mode: 'ask', userMsg });
  }
}
