import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import PartyRoom from './PartyRoom.ts';

// Minimal worker: route `GET /ws` to the PartyRoom DO, which upgrades.
export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: { flags: ['nodejs_compat'] },
  },
  Effect.gen(function* () {
    const rooms = yield* PartyRoom;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const pathname = new URL(request.url, 'http://localhost').pathname;

        if (pathname === '/ws') {
          if (request.headers['upgrade']?.toLowerCase() !== 'websocket') {
            return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
          }
          const room = rooms.getByName('singleton');
          return yield* room.fetch(request);
        }

        return HttpServerResponse.text('hello from realm', { status: 404 });
      }),
    };
  }),
) {}
