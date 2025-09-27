import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';

export class PinesModeHandler extends BaseModeHandler {
  help = 'Pines: vista de mensajes que marcaste con estrella (sólo lectura).';
  canSend(): boolean { return false; }
  async send(_finalInput: string, _userMsg: Message, _ctx: ModeHandlerContext) {
    // No-op
  }
}
