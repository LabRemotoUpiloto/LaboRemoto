import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';

export class BusquedaModeHandler extends BaseModeHandler {
  help = 'Búsqueda: genera y ejecuta planes para localizar archivos, grep o abrir contenido.';
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeBusqueda({ finalInput, userMsg });
  }
}
