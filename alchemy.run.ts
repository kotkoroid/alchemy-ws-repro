import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import Realm from './src/Realm.ts';

export default Alchemy.Stack(
  'AlchemyWsRepro',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const realm = yield* Realm;

    // Vite-served SPA on a sibling subdomain. Mirrors kassandra's
    // game.localhost setup. Browser will load this and try to open a
    // WebSocket to realm.localhost.
    const game = yield* Cloudflare.Vite('Game', {
      rootDir: './game',
      compatibility: { flags: ['nodejs_compat'] },
      env: {
        VITE_REALM_URL: realm.url,
      },
    });

    return { realmUrl: realm.url, gameUrl: game.url };
  }),
);
