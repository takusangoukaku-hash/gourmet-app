// =====================================================
// サービスワーカー: アプリ本体をキャッシュしてオフラインでも
// 起動・閲覧できるようにする（仕様書v2 §14.1 の一部）
//  - 自ドメイン: ネットワーク優先（更新を即反映、オフライン時はキャッシュ）
//  - CDNライブラリ・地図タイル: キャッシュ優先（タイルは件数を制限）
//  - 外部API（店舗検索・AI判定）: キャッシュしない
// =====================================================
const VERSION = 'v393'; // 見直しの続き: 登録（遅れて届く結果が別の記録に入る・日またぎの訪問日・GPS つき手入力の店の位置・前の候補のジャンルが残る）、写真の付け替えの端末間同期、公開投稿の時刻と消え残り、行き止まりになる駅のチップ、ユーザー名の変更 など
const CACHE = 'gourmet-' + VERSION;

// index.html の ?v= と揃える（古いキャッシュの混在防止）。VERSION から自動で組み立てる
const VN = VERSION.replace(/^v/, '');
const SHELL = [
  './', './index.html', `./css/style.css?v=${VN}`,
  ...['store', 'api', 'cloud', 'register', 'import', 'views', 'app'].map(n => `./js/${n}.js?v=${VN}`),
  './js/vendor/anthropic-sdk.js?v=330', // api.js が import する URL と同じにする（v392。以前は ?v=版 で、使われない方を毎回取りに行っていた）
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'tiles.openfreemap.org', 'maps.gsi.go.jp', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// 地図タイル・グリフは増え続けるので上限を設ける（写真の保存領域を圧迫しないように）
const TILE_HOSTS = ['tiles.openfreemap.org', 'maps.gsi.go.jp'];
const TILE_CACHE_MAX = 1500;
// Firebase（認証・DB・写真保存）は常にネットワークへ（キャッシュしない）
const NETWORK_ONLY = ['overpass-api.de', 'overpass.kumi.systems', 'nominatim.openstreetmap.org', 'msearch.gsi.go.jp', 'api.anthropic.com', 'photon.komoot.io', 'places.googleapis.com', 'map.yahooapis.jp', 'webservice.recruit.co.jp', 'api.openpoiapi.com', 'workers.dev',
  'firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseapp.com', 'firebasestorage.app'];

self.addEventListener('install', (e) => {
  // v359〜 ここでは skipWaiting しない。新版は「待機」にとどめ、ページ側が起動直後なら即切り替え、使用中なら帯を出して
  // タップされたら SKIP_WAITING を受けて切り替える（読んでいる最中に勝手に再読み込みしない）
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))); // reload: HTTP キャッシュ（Pages は10分）の古い index.html を新しい版のキャッシュに入れない（v392）
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gourmet-') && k !== CACHE).map(k => caches.delete(k)))) // 同じサイトの diet/ のキャッシュは巻き込まない
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
    // ?v= 付きのファイル（CSS/JS）は内容が版ごとに固定なので、キャッシュ優先で即返す。
    // 新版は index.html の ?v= が変わることで新しいURLとして取りに行く（更新の即時反映は保たれる）
    if (url.searchParams.has('v')) {
      e.respondWith(
        caches.match(e.request).then(m => m || fetch(e.request).then(res => {
          if (cacheable(res)) { const copy = res.clone(); putCached(e.request, copy).catch(() => {}); }
          return res;
        }))
      );
      return;
    }
    // 画面（index.html）はキャッシュ優先で即起動し、裏で取り直して次回に備える（v370〜。版の切り替えは app.js の update() → 新版の SW が担う。
    // 以前はネットワーク優先で、回線が遅いと起動がその分待たされていた）
    if (e.request.mode === 'navigate') {
      // v392: 自分の画面（./ と ./index.html）だけ扱う。以前は同じサイトの diet/・lab/ を開いても BITEMAP の index.html を返し、
      // 取り直した相手の HTML を BITEMAP の index.html として保存していた。また、裏で取り直した新しい index.html を古い版のキャッシュへ入れると、
      // 新しい SW の準備が終わる前にオフラインで開いたとき ?v= の合う CSS/JS が無くなるので、index.html は install のプリキャッシュだけにする
      const root = new URL('./', self.location).pathname;
      if (url.pathname !== root && url.pathname !== root + 'index.html') return;
      e.respondWith(caches.match('./index.html').then(m => m || fetch(e.request).catch(() => Response.error())));
      return;
    }
    // それ以外（アイコン等）はネットワーク優先: 常に最新を取り、オフライン時のみキャッシュを使う
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
