import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist', target: 'esnext' },
  server: {
    port: 5173,
    // The `/realm` proxy is the documented workaround for the
    // browser-direct WS failure (Bug #1). It also surfaces Bug #2:
    // when `alchemy dev` serves the bundle from `game.localhost:1337`
    // with this proxy active, HTTP forwards through `/realm/*` to
    // `realm.localhost:1337/*` correctly — but WS upgrades on the
    // same URL get eaten. See README §Bug 2 for the curl repro.
    proxy: {
      '/realm': {
        target: 'http://realm.localhost:1337',
        rewrite: (path) => path.replace(/^\/realm/, ''),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
