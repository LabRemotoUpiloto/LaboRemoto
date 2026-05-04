import { ModeHandler, ModeHandlerContext, Message, ChatMode } from '../types';

export abstract class BaseModeHandler implements ModeHandler {
  help: string = '';
  canSend(): boolean { return true; }
  abstract send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext): Promise<void>;
}
