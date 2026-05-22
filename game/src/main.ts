const originEl = document.getElementById('origin')!;
const logEl = document.getElementById('log')!;
const goEl = document.getElementById('go') as HTMLButtonElement;

originEl.textContent = window.location.origin;

function log(...parts: unknown[]) {
  logEl.textContent += parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') + '\n';
}

goEl.addEventListener('click', () => {
  logEl.textContent = '';
  // VITE_REALM_URL is injected by alchemy: e.g. "http://realm.localhost:1337"
  const realm = import.meta.env.VITE_REALM_URL as string;
  const wsUrl =
    realm.replace(/\/$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://') + '/ws';
  log('connecting to', wsUrl);
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    log('open');
    ws.send('ping');
  };
  ws.onmessage = (e) => log('msg', String(e.data));
  ws.onerror = () => log('error');
  ws.onclose = (e) => log('closed', e.code, e.reason);
});
