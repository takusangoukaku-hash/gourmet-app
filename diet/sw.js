// =====================================================
// PFCログ サービスワーカー（BITEMAP 本体とは別スコープ: /diet/）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - Anthropic API: キャッシュしない
// =====================================================
const VERSION = 'v3'; // 実機対応: ホーム画面追加の案内・戻るボタンでシートを閉じる・iOS用アイコン・日付またぎ・ショートカット
const CACHE = 'diet-' + VERSION;

// index.html の ?v= と揃える
const SHELL = [
  './', './index.html', './css/style.css?v=3',
  './js/calc.js?v=3', './js/store.js?v=3', './js/ai.js?v=3', './js/app.js?v=3',
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
