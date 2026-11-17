// Cultiva con ROXS: service worker para uso sin conexión
const CACHE = 'cultiva-roxs-v5';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// El HTML NO puede ser cache-first a secas: la app nueva no llegaria nunca y
// habria que subir la version del cache a mano en cada publicacion. Se sirve lo
// guardado al instante (abre rapido y anda sin conexion) y se refresca en
// segundo plano, asi la version nueva entra en la apertura siguiente.
function esHTML(req){
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (esHTML(req)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const red = fetch(req).then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || red;
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('fonts.g'))) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
