import { ModeHandler, ModeHandlerContext, Message } from './types';

export const pinesModeHandler: ModeHandler = {
  canSend() { return false; },
  async send(_finalInput: string, _userMsg: Message, _ctx: ModeHandlerContext) {
    // No-op; ChatPane mostrará aviso propio.
  },
  help: 'Pines: vista de mensajes que marcaste con estrella (sólo lectura).'
};
