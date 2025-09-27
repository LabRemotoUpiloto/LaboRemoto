import { ModeHandler, ModeHandlerContext, Message } from './types';

export const busquedaModeHandler: ModeHandler = {
  canSend() { return true; },
  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    await ctx.invokeBusqueda({ finalInput, userMsg });
  },
  help: 'Búsqueda: genera y ejecuta planes para localizar archivos, grep o abrir contenido.'
};
