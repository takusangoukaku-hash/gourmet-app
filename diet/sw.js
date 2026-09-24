// =====================================================
// PFCログ サービスワーカー（BITEMAP 本体とは別スコープ: /diet/）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - Anthropic API: キャッシュしない
// =====================================================
const VERSION = 'v5'; // 体型: 除脂肪量・筋肉量・部位別筋肉量・股下を反映。部位別の筋肉カード
const CACHE = 'diet-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=5',
  './js/calc.js?v=5', './js/store.js?v=5', './js/ai.js?v=5', './js/body.js?v=5', './js/app.js?v=5',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
];

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
  }
});
