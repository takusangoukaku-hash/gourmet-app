// =====================================================
// ラボ片付け サービスワーカー（BITEMAP 本体・diet とは別スコープ: /lab/）
//  - ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - 更新時に消すのは lab- のキャッシュだけ
// =====================================================
const VERSION = 'v3'; // 全体を小さく: 1画面に10件前後が入る。毎日の後片付けは2行目（毎日）を省く
const CACHE = 'lab-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=3', './js/app.js?v=3',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('lab-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html')))
  );
});
