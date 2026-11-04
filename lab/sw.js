// =====================================================
// ラボ片付け サービスワーカー（BITEMAP 本体・diet とは別スコープ: /lab/）
//  - ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - 更新時に消すのは lab- のキャッシュだけ
// =====================================================
const VERSION = 'v2'; // アプリらしい操作: 本物のスイッチ（iOS は振動）・左スワイプで削除・シートを下に引いて閉じる・並べ替えの動き・ホーム画面に追加の案内
const CACHE = 'lab-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=2', './js/app.js?v=2',
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
