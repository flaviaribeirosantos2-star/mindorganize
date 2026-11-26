// Faz o app abrir mesmo sem internet (guarda os arquivos no aparelho).
const CACHE = 'minha-agenda-v9';
const SHELL = ['./', './index.html', './sync.js', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './fundo.jpg'];
const EXTERNAL = /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const mine = u.origin === self.location.origin;
  if (!mine && !(EXTERNAL.test(u.hostname) && (u.hostname !== 'www.gstatic.com' || u.pathname.startsWith('/firebasejs/')))) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: mine });
    const net = fetch(mine ? e.request.url : e.request, mine ? { cache: 'no-cache' } : undefined).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
    if (mine) {
      // arquivos do app: tenta a versão nova primeiro (para receber atualizações), usa a guardada sem internet
      try { const r = await Promise.race([net, new Promise((_, j) => setTimeout(j, 3000))]); return r || hit; } catch (err) { return hit || net; }
    }
    return hit || net;
  }));
});
