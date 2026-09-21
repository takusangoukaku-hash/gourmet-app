// =====================================================
// PFCログ サービスワーカー（BITEMAP 本体とは別スコープ: /diet/）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - CDN（Anthropic SDK）: キャッシュ優先
//  - Anthropic API: キャッシュしない
// =====================================================
const VERSION = 'v1'; // 初版: 食事PFC・体重グラフ・自転車/筋トレ記録・写真AI推定
const CACHE = 'diet-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=1',
  './js/calc.js?v=1', './js/store.js?v=1', './js/ai.js?v=1', './js/app.js?v=1',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

const CDN_HOSTS = ['esm.sh'];
const NETWORK_ONLY = ['api.anthropic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('diet-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NETWORK_ONLY.some(h => url.hostname.endsWith(h))) return;

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))
      )
    );
  } else if (CDN_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(
      caches.match(e.request).then(m => m || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  }
});
