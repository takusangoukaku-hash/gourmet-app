// =====================================================
// サービスワーカー: アプリ本体をキャッシュしてオフラインでも
// 起動・閲覧できるようにする（仕様書v2 §14.1 の一部）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - CDNライブラリ・地図タイル: キャッシュ優先
//  - 外部API（店舗検索・AI判定）: キャッシュしない
// =====================================================
const VERSION = 'v68'; // POIの点を廃止し施設名のみ表示（種別で色分け）
const CACHE = 'gourmet-' + VERSION;

// index.html の ?v= と揃える（古いキャッシュの混在防止）
const SHELL = [
  './', './index.html', './css/style.css?v=68',
  './js/store.js?v=68', './js/api.js?v=68', './js/cloud.js?v=68', './js/register.js?v=68', './js/views.js?v=68', './js/app.js?v=68',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'esm.sh', 'tiles.openfreemap.org', 'maps.gsi.go.jp', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Firebase（認証・DB・写真保存）は常にネットワークへ（キャッシュしない）
const NETWORK_ONLY = ['overpass-api.de', 'overpass.kumi.systems', 'nominatim.openstreetmap.org', 'api.anthropic.com', 'photon.komoot.io', 'places.googleapis.com',
  'firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseapp.com', 'firebasestorage.app'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NETWORK_ONLY.some(h => url.hostname.endsWith(h))) return;

  if (url.origin === location.origin) {
    // ネットワーク優先: 常に最新を取り、オフライン時のみキャッシュを使う
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() =>
        // ignoreSearch: ?v= の違いでオフライン時にキャッシュを取り逃さないように
        caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))
      )
    );
  } else if (CDN_HOSTS.some(h => url.hostname.endsWith(h))) {
    // キャッシュ優先: ライブラリと地図タイルは変わらないので高速化
    e.respondWith(
      caches.match(e.request).then(m => m || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  }
});
