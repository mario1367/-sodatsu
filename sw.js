// ホーム画面に追加（アプリとして入れる）ために必要な、いちばん小さなしくみ。
// いつもはネットから最新のページを読み、電波がないときだけ前に保存したページを出す
const CACHE = 'osanpo-v1';
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
