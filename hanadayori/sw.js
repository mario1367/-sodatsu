// 花だより用。おさんぽの国（ひとつ上のフォルダ）のしくみとは別にして、保存したページが混ざらないようにする
const CACHE = 'hanadayori-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.add('./')).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {});
    return res;
  }).catch(() => caches.match('./')));
});
