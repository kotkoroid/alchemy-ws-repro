import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

// Minimal DO that accepts a WebSocket and echoes any message back.
export default class PartyRoom extends Cloudflare.DurableObjectNamespace<PartyRoom>()(
  'PartyRoom',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      return {
        fetch: Effect.gen(function* () {
          const [response, socket] = yield* Cloudflare.upgrade();
          socket.ws.send('hello from PartyRoom');
          return response;
        }),

        webSocketMessage: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          message: string | ArrayBuffer,
        ) {
          const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
          socket.ws.send(`echo: ${text}`);
        }),

        webSocketClose: Effect.fnUntraced(function* (
          _ws: Cloudflare.DurableWebSocket,
          _code: number,
          _reason: string,
        ) {
          // no-op
        }),
      };
    });
  }),
) {}
