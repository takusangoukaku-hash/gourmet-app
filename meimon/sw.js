// =====================================================
// 百名店チェック サービスワーカー（スコープ: /meimon/）
//  - ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - 同じオリジンの GET のうち、自分のスコープの下だけ扱う
//  - 更新時に消すのは meimon- のキャッシュだけ
// =====================================================
const VERSION = 'v19'; // 都道府県の中を 区・市ごと／駅ごと に分けて見られる（取り込みの 11 個目の欄＝市区町村）
const CACHE = 'meimon-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=19', './js/mapstyle.js?v=19', './js/app.js?v=19',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('meimon-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html')))
  );
});
