export const ROAST_REPLY_PORT = Symbol("ROAST_REPLY_PORT");

export interface RoastReplyPort {
  reply(message: string, userId?: string): Promise<string>;
}
