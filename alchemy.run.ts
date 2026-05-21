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
    return { realmUrl: realm.url };
  }),
);
