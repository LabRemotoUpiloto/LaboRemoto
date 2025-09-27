import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';

export class AnalisisModeHandler extends BaseModeHandler {
  help = 'Análisis: (beta) orientado a inspección y futura edición asistida de archivos.';
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeAsk({ finalInput, mode: 'analisis', userMsg });
  }
}
