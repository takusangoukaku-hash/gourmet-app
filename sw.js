// =====================================================
// サービスワーカー: アプリ本体をキャッシュしてオフラインでも
// 起動・閲覧できるようにする（仕様書v2 §14.1 の一部）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - CDNライブラリ・地図タイル: キャッシュ優先（タイルは件数を制限）
//  - 外部API（店舗検索・AI判定）: キャッシュしない
// =====================================================
const VERSION = 'v296'; // セキュリティ・堅牢性の一括修正（バックアップ検証・別アカウント切替時の消去・SWのエラー応答除外 ほか）
const CACHE = 'gourmet-' + VERSION;

// index.html の ?v= と揃える（古いキャッシュの混在防止）。VERSION から自動で組み立てる
const VN = VERSION.replace(/^v/, '');
const SHELL = [
  './', './index.html', `./css/style.css?v=${VN}`,
  ...['store', 'api', 'cloud', 'register', 'views', 'app'].map(n => `./js/${n}.js?v=${VN}`),
  `./js/vendor/anthropic-sdk.js?v=${VN}`,
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'tiles.openfreemap.org', 'maps.gsi.go.jp', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// 地図タイル・グリフは増え続けるので上限を設ける（写真の保存領域を圧迫しないように）
const TILE_HOSTS = ['tiles.openfreemap.org', 'maps.gsi.go.jp'];
const TILE_CACHE_MAX = 1500;
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

// 正常な応答だけをキャッシュする（404や5xxを保存すると、その後ずっと壊れた内容を返してしまう）
const cacheable = (res) => res && (res.ok || res.type === 'opaque');
let tilePuts = 0;
async function putCached(req, res) {
  const c = await caches.open(CACHE);
  await c.put(req, res);
  // タイルは一定数ごとに古いものから間引く
  if (TILE_HOSTS.some(h => new URL(req.url).hostname.endsWith(h)) && (++tilePuts % 50 === 0)) {
    const keys = (await c.keys()).filter(r => TILE_HOSTS.some(h => new URL(r.url).hostname.endsWith(h)));
    for (const k of keys.slice(0, Math.max(0, keys.length - TILE_CACHE_MAX))) await c.delete(k);
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NETWORK_ONLY.some(h => url.hostname.endsWith(h))) return;

  if (url.origin === location.origin) {
    // ネットワーク優先: 常に最新を取り、オフライン時のみキャッシュを使う
    e.respondWith(
      fetch(e.request).then(res => {
        if (cacheable(res)) { const copy = res.clone(); putCached(e.request, copy).catch(() => {}); }
        return res;
      }).catch(() =>
        // ignoreSearch: ?v= の違いでオフライン時にキャッシュを取り逃さないように
        caches.match(e.request, { ignoreSearch: true }).then(m => {
          if (m) return m;
          // 画面遷移（HTMLの要求）だけは index.html で代用する。CSSやアイコンにHTMLを返さない
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
    );
  } else if (CDN_HOSTS.some(h => url.hostname.endsWith(h))) {
    // キャッシュ優先: ライブラリと地図タイルは変わらないので高速化
    e.respondWith(
      caches.match(e.request).then(m => m || fetch(e.request).then(res => {
        if (cacheable(res)) { const copy = res.clone(); putCached(e.request, copy).catch(() => {}); }
        return res;
      }))
    );
  }
});
